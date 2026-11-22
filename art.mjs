import { readFile, writeFile, mkdir, access } from "node:fs/promises";

import path from "node:path";

import { createRequire } from "node:module";

import { pathToFileURL } from "node:url";

const BRAIN = path.resolve("..", "inoderecords");

const CORE = pathToFileURL(path.join(BRAIN, "packages", "agent", "core")).href + "/";

const OUT = "art";

const PX = 640;

const QUALITY = 82;

const force = process.argv.includes("--force");

let findCoverArt, mbSearch, sharp;

try {
    ({findCoverArt: findCoverArt} = await (import(CORE + "coverart.mjs")));
    ({mbSearch: mbSearch} = await (import(CORE + "feeds.mjs")));
    sharp = createRequire(path.join(BRAIN, "package.json"))("sharp");
} catch (err) {
    console.error(`\nart.mjs needs the main checkout beside this one, at:\n  ${BRAIN}\n\nIt borrows the cover matcher (packages/agent/core/coverart.mjs) and sharp from\nthere rather than keeping a second copy. The committed PNGs in ${OUT}/ mean you\ndo not need any of this to build the page -- only to add a new record.\n\n  ${err.message}\n`);
    process.exit(1);
}

export const albumSlug = (artist, album) => `${artist} ${album}`.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const UA = "INODERECORDS/0.1 (+https://inoderecords.com)";

async function headOk(url) {
    try {
        const r = await fetch(url, {
            method: "HEAD",
            redirect: "follow",
            headers: {
                "user-agent": UA
            },
            signal: AbortSignal.timeout(2e4)
        });
        return r.ok;
    } catch {
        return false;
    }
}

async function patientSearch(query, limit, entity) {
    let last;
    for (let i = 0; i < 4; i++) {
        try {
            const body = await mbSearch(query, limit, entity);
            if (body?.error) throw new Error(body.error);
            return body;
        } catch (err) {
            last = err;
            await new Promise(r => setTimeout(r, 1500 * (i + 1)));
        }
    }
    throw last;
}

async function writeCover(buf, file) {
    await sharp(buf).resize(PX, PX, {
        fit: "cover",
        position: "centre"
    }).jpeg({
        quality: QUALITY,
        mozjpeg: true,
        chromaSubsampling: "4:2:0"
    }).toFile(file);
}

const exists = p => access(p).then(() => true, () => false);

const stock = JSON.parse(await readFile("stock.json", "utf8"));

await mkdir(OUT, {
    recursive: true
});

const albums = new Map;

for (const r of stock.records) {
    const slug = albumSlug(r.artist, r.album);
    if (!albums.has(slug)) albums.set(slug, {
        slug: slug,
        artist: r.artist,
        album: r.album,
        ids: []
    });
    albums.get(slug).ids.push(r.id);
}

const manifest = {};

let fetched = 0;

let kept = 0;

const missing = [];

for (const a of albums.values()) {
    const cover = path.join(OUT, `${a.slug}.jpg`);
    if (!force && await exists(cover)) {
        manifest[a.slug] = {
            artist: a.artist,
            album: a.album,
            ids: a.ids
        };
        kept++;
        console.log(`keep   ${a.slug}`);
        continue;
    }
    let hit = null;
    try {
        hit = await findCoverArt({
            artist: a.artist,
            title: a.album
        }, {
            mbSearch: patientSearch,
            headOk: headOk
        });
    } catch (err) {
        console.error(`ERROR  ${a.slug}  musicbrainz unreachable: ${err.message}`);
        missing.push(a.slug);
        continue;
    }
    if (!hit) {
        console.error(`MISS   ${a.slug}  no confident match -- paste a cover into ${cover} by hand`);
        missing.push(a.slug);
        continue;
    }
    const res = await fetch(hit.url, {
        redirect: "follow",
        headers: {
            "user-agent": UA
        },
        signal: AbortSignal.timeout(45e3)
    });
    if (!res.ok) {
        console.error(`ERROR  ${a.slug}  cover art archive ${res.status}`);
        missing.push(a.slug);
        continue;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    await writeCover(buf, cover);
    manifest[a.slug] = {
        artist: a.artist,
        album: a.album,
        ids: a.ids,
        mbid: hit.mbid,
        year: hit.year
    };
    fetched++;
    const kb = ((await (import("node:fs"))).statSync(cover).size / 1024).toFixed(0);
    console.log(`fetch  ${a.slug}  ${kb} KB  mb=${hit.mbid} year=${hit.year}`);
}

await writeFile(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

console.log(`\n${fetched} fetched, ${kept} already on disk, ${missing.length} missing`);

if (missing.length) {
    console.log(`missing: ${missing.join(", ")}`);
    console.log("The page renders without them -- the sleeve just shows no artwork.");
}