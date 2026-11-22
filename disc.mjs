import { readFile, writeFile, mkdir, access, rm } from "node:fs/promises";

import path from "node:path";

import { createRequire } from "node:module";

import { pathToFileURL } from "node:url";

const BRAIN = path.resolve("..", "inoderecords");

const CORE = pathToFileURL(path.join(BRAIN, "packages", "agent", "core")).href + "/";

const OUT = "art";

const PX = 620;

const LEDGER = path.join(OUT, "discs.json");

const force = process.argv.includes("--force");

let resolveDiscogsByText, fetchDiscogs, discogsGet, saneCircle, sharp;

try {
    ({resolveDiscogsByText: resolveDiscogsByText, fetchDiscogs: fetchDiscogs, discogsGet: discogsGet} = await (import(CORE + "discogs.mjs")));
    ({saneCircle: saneCircle} = await (import(CORE + "pressing.mjs")));
    sharp = createRequire(path.join(BRAIN, "package.json"))("sharp");
} catch (err) {
    console.error(`\ndisc.mjs needs the main checkout beside this one, at:\n  ${BRAIN}\n\nIt borrows the disc resolver, the Discogs client and sharp from there rather\nthan keeping a second copy. What it writes into ${OUT}/ is committed, so you\ndo not need any of this to build the page.\n\n  ${err.message}\n`);
    process.exit(1);
}

const DISCOGS = process.env.DISCOGS_TOKEN;

const GEMINI = process.env.GEMINI_API_KEY;

if (!DISCOGS || !GEMINI) {
    console.error(`\nNeeds DISCOGS_TOKEN and GEMINI_API_KEY. Run it with the main repo's env:\n\n  node --env-file=../inoderecords/.env.local disc.mjs\n`);
    process.exit(1);
}

const MODELS = [ "gemini-flash-lite-latest", "gemini-flash-latest" ];

const MAX_IMAGES = 6;

let visionCalls = 0;

const MIME = {
    webp: "image/webp",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif"
};

async function loadPhoto(src) {
    if (!/^https?:/i.test(src)) {
        const buf = await readFile(src);
        const ext = path.extname(src).slice(1).toLowerCase();
        return {
            buf: buf,
            type: MIME[ext] ?? "image/jpeg"
        };
    }
    const r = await fetch(src, {
        headers: {
            "user-agent": "INODERECORDS/0.1 (+https://inoderecords.com)"
        },
        signal: AbortSignal.timeout(3e4)
    });
    if (!r.ok) return null;
    const type = (r.headers.get("content-type") ?? "image/jpeg").split(";")[0];
    if (!type.startsWith("image/")) return null;
    return {
        buf: Buffer.from(await r.arrayBuffer()),
        type: type
    };
}

async function asImageBlock(src) {
    const got = await loadPhoto(src).catch(() => null);
    if (!got || got.buf.length > 5 * 1024 * 1024) return null;
    return {
        inline_data: {
            mime_type: got.type,
            data: got.buf.toString("base64")
        }
    };
}

async function analyzeVision({imageUrls: imageUrls, discCount: discCount = 1, edition: edition}) {
    const n = Math.max(1, Math.min(4, Math.floor(discCount) || 1));
    const urls = (imageUrls ?? []).filter(Boolean).slice(0, MAX_IMAGES);
    if (!urls.length) return null;
    const content = [];
    const attached = [];
    for (const url of urls) {
        const block = await asImageBlock(url);
        if (block) {
            content.push({
                text: `image ${attached.length}:`
            }, block);
            attached.push(url);
        }
    }
    if (!attached.length) throw new Error("every candidate image failed to download");
    content.unshift({
        text: `These are product photos for a ${n}-disc vinyl release${edition ? ` (${edition})` : ""}. Find the ONE image that best shows the vinyl disc(s) — INCLUDING a packshot/mockup where the record(s) only PEEK OUT from behind the sleeve. For EACH of the ${n} discs, ordered LEFT TO RIGHT as they appear in that image, give the disc's FULL bounding circle as fractions of image width/height.\nReturn ONLY JSON (no markdown):\n{"imageIndex": 0, "discs": [{"cx": 0.7, "cy": 0.5, "r": 0.3}]}\nRules:\n- Pick the image where the disc(s) are most visible. If NO image shows any disc at all, return {"imageIndex": -1, "discs": []}.\n- THE DISC MUST MATCH THE EDITION DESCRIBED ABOVE. If that description names a colour or finish (for example a splatter, a clear or a coloured pressing) and the disc you can see is plainly something else, such as a standard black record, that is the WRONG disc: return {"imageIndex": -1, "discs": []} instead of returning it. A release's photo gallery often contains other pressings. Returning the wrong one misrepresents the record being sold, which is worse than returning nothing.\n- EXTRAPOLATE each disc's FULL circle from the visible arc — cx/cy/r MAY go below 0 or above 1 where the disc is hidden behind the sleeve or overlapped by another disc. Estimate the true centre and radius of the whole record, not just the visible sliver.\n- Return the discs you can see, up to ${n}, strictly in left-to-right order.`
    });
    let last;
    for (const model of MODELS) {
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                visionCalls++;
                const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI}`, {
                    method: "POST",
                    headers: {
                        "content-type": "application/json"
                    },
                    body: JSON.stringify({
                        contents: [ {
                            parts: content
                        } ],
                        generationConfig: {
                            temperature: .1
                        }
                    }),
                    signal: AbortSignal.timeout(12e4)
                });
                if (r.status === 429 || r.status >= 500) throw new Error(`${model} ${r.status}`);
                if (!r.ok) throw new Error(`${model} ${r.status}: ${(await r.text()).slice(0, 160)}`);
                const data = await r.json();
                const text = (data.candidates?.[0]?.content?.parts ?? []).map(x => x.text ?? "").join("");
                const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? "null");
                const idx = parsed?.imageIndex;
                if (!Number.isInteger(idx) || idx < 0 || idx >= attached.length) return null;
                const circles = (Array.isArray(parsed.discs) ? parsed.discs : []).map(d => saneCircle(d)).filter(Boolean).slice(0, n);
                if (!circles.length) return null;
                return {
                    url: attached[idx],
                    circles: circles
                };
            } catch (err) {
                last = err;
                await new Promise(res => setTimeout(res, 2500 * (attempt + 1)));
            }
        }
    }
    throw last ?? new Error("vision pass failed");
}

const exists = p => access(p).then(() => true, () => false);

const discsIn = format => {
    const m = /^(\d+)\s*LP$/i.exec(String(format || "").trim());
    return m ? Math.max(1, Math.min(4, Number(m[1]))) : 1;
};

const COLOURS = /\b(orange|red|blue|green|yellow|purple|violet|pink|white|black|clear|gold|silver|bronze|amber|teal|cream|bone|ivory|grey|gray|magenta|turquoise|marbled?|splatter|galaxy|smoke|coke ?bottle|sea ?glass|olive|maroon|cobalt)\b/gi;

function colourSet(text) {
    const out = new Set;
    for (const m of String(text ?? "").matchAll(COLOURS)) {
        const w = m[0].toLowerCase().replace(/\s+/g, " ");
        if (w !== "black") out.add(w);
    }
    return out;
}

function samePressing(ours, theirs) {
    const a = colourSet(ours);
    const b = colourSet(theirs);
    if (!a.size && !b.size) return {
        ok: true,
        why: "neither names a colour"
    };
    for (const w of a) if (b.has(w)) return {
        ok: true,
        why: `both say ${w}`
    };
    const fmt = s => s.size ? [ ...s ].join("/") : "nothing";
    return {
        ok: false,
        why: `we say ${fmt(a)}, Discogs says ${fmt(b)}`
    };
}

async function cutDisc(buf, circle, file) {
    const meta = await sharp(buf).metadata();
    const iw = meta.width;
    const ih = meta.height;
    const r = circle.r * Math.min(iw, ih);
    const box = 2 * r;
    const sx0 = circle.cx * iw - r;
    const sy0 = circle.cy * ih - r;
    const ix0 = Math.max(0, Math.round(sx0));
    const iy0 = Math.max(0, Math.round(sy0));
    const ix1 = Math.min(iw, Math.round(sx0 + box));
    const iy1 = Math.min(ih, Math.round(sy0 + box));
    if (ix1 <= ix0 || iy1 <= iy0) return false;
    const k = PX / box;
    const left = Math.min(PX - 1, Math.max(0, Math.round((ix0 - sx0) * k)));
    const top = Math.min(PX - 1, Math.max(0, Math.round((iy0 - sy0) * k)));
    const w = Math.max(1, Math.min(PX - left, Math.round((ix1 - ix0) * k)));
    const h = Math.max(1, Math.min(PX - top, Math.round((iy1 - iy0) * k)));
    const piece = await sharp(buf).extract({
        left: ix0,
        top: iy0,
        width: ix1 - ix0,
        height: iy1 - iy0
    }).resize(w, h, {
        fit: "fill"
    }).toBuffer();
    const mask = Buffer.from(`<svg width="${PX}" height="${PX}"><circle cx="${PX / 2}" cy="${PX / 2}" r="${PX / 2 - 1}" fill="#fff"/></svg>`);
    await sharp({
        create: {
            width: PX,
            height: PX,
            channels: 4,
            background: {
                r: 0,
                g: 0,
                b: 0,
                alpha: 0
            }
        }
    }).composite([ {
        input: piece,
        left: left,
        top: top
    }, {
        input: mask,
        blend: "dest-in"
    } ]).png({
        compressionLevel: 9
    }).toFile(file);
    return true;
}

async function looksRight(file, edition) {
    if (!colourSet(edition).size) return {
        ok: true,
        why: "plain pressing"
    };
    const {data: data, info: info} = await sharp(file).resize(128, 128, {
        fit: "fill"
    }).ensureAlpha().raw().toBuffer({
        resolveWithObject: true
    });
    const c = info.width / 2;
    let n = 0, sumL = 0, sumS = 0;
    for (let y = 0; y < info.height; y++) {
        for (let x = 0; x < info.width; x++) {
            const i = (y * info.width + x) * info.channels;
            if (data[i + 3] < 200) continue;
            const d = Math.hypot(x - c, y - c) / c;
            if (d < .4 || d > .95) continue;
            const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
            const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
            sumL += (mx + mn) / 2;
            sumS += mx === mn ? 0 : (mx - mn) / (1 - Math.abs(mx + mn - 1) || 1);
            n++;
        }
    }
    if (!n) return {
        ok: true,
        why: "nothing measurable"
    };
    const L = sumL / n, S = sumS / n;
    if (L < .24 && S < .14) {
        return {
            ok: false,
            why: `photo is a plain black record (L ${L.toFixed(2)}, S ${S.toFixed(2)})`
        };
    }
    return {
        ok: true,
        why: `L ${L.toFixed(2)} S ${S.toFixed(2)}`
    };
}

async function openFrom(file) {
    const S = 200;
    const {data: data, info: info} = await sharp(file).resize(S, S, {
        fit: "fill"
    }).ensureAlpha().raw().toBuffer({
        resolveWithObject: true
    });
    const c = (S - 1) / 2;
    const rad = c * .95;
    for (let x = S - 1; x >= 0; x--) {
        const dx = x - c;
        if (Math.abs(dx) > rad) continue;
        const span = Math.sqrt(rad * rad - dx * dx);
        for (let y = Math.ceil(c - span); y <= Math.floor(c + span); y++) {
            if (data[(y * info.width + x) * info.channels + 3] < 200) {
                return Math.max(-1, Math.min(1, dx / c));
            }
        }
    }
    return -1;
}

async function pressingHunt(masterId, want, note) {
    const versions = [];
    for (let page = 1; page <= 3; page++) {
        let body;
        try {
            const r = await discogsGet(`https://api.discogs.com/masters/${masterId}/versions?per_page=100&page=${page}`, DISCOGS);
            if (!r?.ok) {
                if (note) note(`versions page ${page}: discogs ${r?.status ?? "?"}`);
                break;
            }
            body = await r.json();
        } catch (err) {
            if (note) note(`versions page ${page} failed: ${err.message}`);
            break;
        }
        versions.push(...body.versions ?? []);
        if (page >= (body.pagination?.pages ?? 1)) break;
    }
    const BUDGET = 22;
    const vinyl = versions.filter(v => /\bLP\b|\bVinyl\b|\b(?:7|10|12)"/i.test(String(v.format ?? ""))).filter(v => !/\b(file|aac|mp3|flac|wav|cdr?|cassette|dvd|blu-?ray|shm-?cd|digital|streaming)\b/i.test(String(v.format ?? ""))).slice(0, BUDGET);
    const scored = [];
    for (const v of vinyl) {
        let shaped;
        try {
            shaped = await fetchDiscogs(new URL(`https://www.discogs.com/release/${v.id}`), DISCOGS);
        } catch {
            continue;
        }
        if (!shaped?.images?.length) continue;
        const ed = shaped.edition || "";
        const has = colourSet(ed);
        let hit = 0;
        for (const w of want) if (has.has(w)) hit++;
        const ok = want.size ? hit > 0 : has.size === 0;
        if (!ok) continue;
        scored.push({
            shaped: shaped,
            score: hit * 10 - [ ...has ].filter(w => !want.has(w)).length,
            why: `v${v.id} "${ed || "no edition"}"`
        });
    }
    scored.sort((a, b) => b.score - a.score);
    if (note) note(`${versions.length} version(s), ${vinyl.length} vinyl, ${scored.length} claim our colour`);
    return scored.slice(0, 6);
}

const stock = JSON.parse(await readFile("stock.json", "utf8"));

await mkdir(OUT, {
    recursive: true
});

let ledger = {};

try {
    ledger = JSON.parse(await readFile(LEDGER, "utf8"));
} catch {}

let applied = 0, none = 0, skipped = 0, broke = 0;

for (const r of stock.records) {
    if (r.format === "CD") {
        skipped++;
        continue;
    }
    if (!force && ledger[r.id]) {
        console.log(`keep    ${r.id}`);
        skipped++;
        continue;
    }
    const n = discsIn(r.format);
    const want = colourSet(r.variant);
    const tried = [];
    let candidates = [];
    if (r._photo) {
        candidates = [ {
            shaped: {
                images: [ r._photo ],
                edition: r.variant || ""
            },
            why: `owner photo ${r._photo}`,
            pinned: true
        } ];
    } else if (r.discogs) {
        const pin = await fetchDiscogs(new URL(String(r.discogs)), DISCOGS);
        if (pin) candidates = [ {
            shaped: pin,
            why: "pinned",
            pinned: true
        } ];
    } else {
        const seed = await resolveDiscogsByText({
            title: r.album,
            artist: r.artist,
            format: r.format
        }, DISCOGS);
        if (seed?.masterId) {
            candidates = await pressingHunt(seed.masterId, want, m => console.log(`        ${r.id}: ${m}`));
        } else if (seed && samePressing(r.variant, seed.edition || "").ok) {
            candidates = [ {
                shaped: seed,
                why: `seed "${seed.edition || "no edition"}"`
            } ];
        }
    }
    if (!candidates.length) {
        console.log(`NONE    ${r.id.padEnd(12)} no pressing of this album claims ${want.size ? [ ...want ].join("/") : "a plain pressing"}`);
        none++;
        continue;
    }
    let done = null, failed = null;
    for (const cand of candidates) {
        if (done) break;
        const shaped = cand.shaped;
        if (!shaped?.images?.length) continue;
        const edition = shaped.edition || r.variant || "";
        tried.push(cand.why);
        let found;
        try {
            found = await analyzeVision({
                imageUrls: shaped.images,
                discCount: n,
                edition: edition
            });
        } catch (err) {
            failed = err;
            continue;
        }
        if (!found?.circles?.length) continue;
        const got = await loadPhoto(found.url).catch(() => null);
        if (!got) continue;
        const buf = got.buf;
        const files = [];
        for (let k = 0; k < found.circles.length; k++) {
            const file = path.join(OUT, `${r.id}-disc${k + 1}.png`);
            try {
                if (await cutDisc(buf, found.circles[k], file)) files.push(`${OUT}/${r.id}-disc${k + 1}.png`);
            } catch (err) {
                console.log(`        disc ${k + 1} could not be cut: ${err.message}`);
            }
        }
        if (!files.length) continue;
        const look = await looksRight(files[0], cand.pinned ? "" : edition);
        if (!look.ok) {
            for (const f of files) await rm(f, {
                force: true
            });
            continue;
        }
        let open = -1;
        for (const f of files) open = Math.max(open, await openFrom(f));
        done = {
            files: files,
            open: open,
            from: found.url,
            edition: edition,
            why: cand.why
        };
    }
    if (!done) {
        if (failed) {
            console.log(`FAILED  ${r.id.padEnd(12)} vision pass never completed: ${failed.message}`);
            broke++;
        } else {
            console.log(`NONE    ${r.id.padEnd(12)} looked at ${tried.length} pressing(s), none showed our disc`);
            if (tried.length) console.log(`        tried: ${tried.slice(0, 4).join(" | ")}`);
            none++;
        }
        continue;
    }
    ledger[r.id] = {
        discs: done.files,
        open: done.open,
        source: "catalog",
        from: done.from,
        edition: done.edition
    };
    applied++;
    const how = done.open <= -.98 ? "whole record" : `solid from ${done.open.toFixed(2)}`;
    console.log(`OK      ${r.id.padEnd(12)} ${done.files.length} disc(s), ${how}  <- ${done.why}`);
}

await writeFile(LEDGER, JSON.stringify(ledger, null, 2) + "\n");

console.log(`\n${applied} applied, ${none} cover-only, ${broke} failed, ` + `${skipped} skipped (CD or already done)  [${visionCalls} vision calls]`);

if (none) {
    console.log("Cover-only is a normal outcome, not a failure: no pressing of that");
    console.log("album both claims our colour and has a photo of its disc. Pin the");
    console.log('exact release with "discogs" in stock.json if you know it.');
}

if (broke) {
    console.log("FAILED is different: nobody ever looked. Rerun before believing it.");
    process.exitCode = 1;
}

if (broke) {
    console.log("FAILED is different: nobody ever looked at those photos. Rerun before believing it.");
    process.exitCode = 1;
}