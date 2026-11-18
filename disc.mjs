/*
  Disc photos: what the record in each sleeve ACTUALLY looks like.

  THE RULE THIS EXISTS TO OBEY. The disc render is built from real product
  photos only, cropped and mapped onto the disc. Never guessed from the
  edition text, and never procedural. The owner has rejected both, twice:

      "a word is not a look"

  and, of algorithmically-drawn marble tinted with observed colours,
  "you'll never get right". A page that invents a green splatter because the
  listing contains the word "splatter" is making up what the buyer is paying
  extra for.

  So nothing here reads the variant string for a colour. It finds a
  photograph and cuts the record out of it.

  HOW IT WORKS. The pieces are the brain's; the hunt is ours.

    core/discogs.mjs    resolveDiscogsByText for a seed release and the
                        album's master id, fetchDiscogs for any pressing by
                        url, discogsGet for the master's version list.

    core/pressing.mjs   saneCircle, and the analyzer CONTRACT: a vision pass
                        whose job is GEOMETRY, not taste. Pick the image
                        that best shows the disc(s) and return one bounding
                        circle per disc, left to right, extrapolated to the
                        full circle even where the record is hidden behind
                        the sleeve. Our analyzer below implements it.

  WHAT WE DO DIFFERENTLY, AND WHY. core/disc-resolve.mjs checks one release
  and then sweeps the first six sibling versions in whatever order Discogs
  lists them. For a product page being backfilled that is fine. Here it kept
  handing back the wrong record: "Amazon Exclusive Bone White Vinyl" resolved
  to a BABY BLUE pressing, and a photo of the wrong pressing is worse than
  no photo, because it looks authoritative.

  A master usually has dozens of versions and each one's format string names
  its colour. So pressingHunt() pulls the whole list, RANKS it by how well
  its colours match our variant, and walks it best-first until a pressing
  yields a disc photo that survives both checks below. That is the
  difference between "a record of this album" and "this record".

  Then cut the circle out and write a square PNG with the outside
  transparent. The web app does that crop at runtime in a canvas; doing it
  here means the shop page ships a plain image and needs no crop code.

  HOW FAR EACH CROP OPENS. The circle is extrapolated, so a disc
  photographed peeking out from behind its sleeve only HAS pixels for the
  visible arc. openFrom() measures where each crop goes solid and the page
  pulls it exactly that far: a whole record comes right out, an arc stays
  tucked. Nothing spins either way, because spinning would rotate the
  transparent half into view.

  NO PHOTO MEANS NO DISC. A record we cannot find a photograph of renders
  cover-only. That is the whole point of the rule: the honest answer to "what
  does this pressing look like" is sometimes "here is the sleeve, ask us for
  a photo", and the footer already says we will send one.

      node disc.mjs                 catalog hits only, the safe default
      node disc.mjs --force         redo records already done

  Costs one Gemini vision call per record, sometimes two. Fractions of a cent
  for a shelf this size.
*/

import { readFile, writeFile, mkdir, access, rm } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const BRAIN = path.resolve('..', 'inoderecords');
const CORE = pathToFileURL(path.join(BRAIN, 'packages', 'agent', 'core')).href + '/';

const OUT = 'art';
const PX = 620;          // the disc crop, square. Alpha outside the circle.
const LEDGER = path.join(OUT, 'discs.json');

const force = process.argv.includes('--force');

/* ── the brain ──────────────────────────────────────────────────────── */

let resolveDiscogsByText, fetchDiscogs, discogsGet, saneCircle, sharp;
try {
  ({ resolveDiscogsByText, fetchDiscogs, discogsGet } = await import(CORE + 'discogs.mjs'));
  ({ saneCircle } = await import(CORE + 'pressing.mjs'));
  sharp = createRequire(path.join(BRAIN, 'package.json'))('sharp');
} catch (err) {
  console.error(`
disc.mjs needs the main checkout beside this one, at:
  ${BRAIN}

It borrows the disc resolver, the Discogs client and sharp from there rather
than keeping a second copy. What it writes into ${OUT}/ is committed, so you
do not need any of this to build the page.

  ${err.message}
`);
  process.exit(1);
}

const DISCOGS = process.env.DISCOGS_TOKEN;
const GEMINI = process.env.GEMINI_API_KEY;
if (!DISCOGS || !GEMINI) {
  console.error(`
Needs DISCOGS_TOKEN and GEMINI_API_KEY. Run it with the main repo's env:

  node --env-file=../inoderecords/.env.local disc.mjs
`);
  process.exit(1);
}

/* ── the vision pass ────────────────────────────────────────────────── */

/*
  The first run reported all four records as having no disc in any photo.
  They had twenty, thirty-nine, ten and thirteen photos. Here is the log:

    disc-photo analysis failed (renders cover-only): gemini 503
    disc-photo analysis failed (renders cover-only): aborted due to timeout
    NONE  charli-lp  no disc in any photo -- Discogs+shop 20 · web → none

  Every call failed, and because analyzeDiscPhoto catches its own errors and
  returns null, a free-tier outage came out of the other end as a fact about
  the records. Same shape as MusicBrainz answering "busy" and the cover
  matcher turning that into "this album has no art".

  So two things changed. A MODEL CHAIN, because `gemini-flash-latest` was
  returning "currently experiencing high demand" while `-lite-` answered
  fine, and one overloaded alias should not end the run. And this analyser
  THROWS rather than swallowing, so the caller can count a failed look
  separately from an honest miss. "We never managed to look" and "there is
  no photo of this record" must never again print the same word.

  The memory's other suggestion, Claude Haiku, is a drop-in here and was
  tried first: CLAUDE_API in .env.local returns 401 invalid x-api-key, so
  that key needs replacing before it is an option.

  resolveDisc takes an injected analyser precisely so the vendor can change
  without touching the brain. Same prompt, same contract, same saneCircle.
*/

// tried in order; a 503 on one moves to the next rather than ending the run
const MODELS = ['gemini-flash-lite-latest', 'gemini-flash-latest'];
const MAX_IMAGES = 6;

let visionCalls = 0;

const MIME = { webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif' };

/** A photo on disk or a photo on Discogs; the analyser does not care which. */
async function loadPhoto(src) {
  if (!/^https?:/i.test(src)) {
    const buf = await readFile(src);
    const ext = path.extname(src).slice(1).toLowerCase();
    return { buf, type: MIME[ext] ?? 'image/jpeg' };
  }
  const r = await fetch(src, {
    headers: { 'user-agent': 'INODERECORDS/0.1 (tech@skysharelabs.com)' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) return null;
  const type = (r.headers.get('content-type') ?? 'image/jpeg').split(';')[0];
  if (!type.startsWith('image/')) return null;
  return { buf: Buffer.from(await r.arrayBuffer()), type };
}

async function asImageBlock(src) {
  const got = await loadPhoto(src).catch(() => null);
  if (!got || got.buf.length > 5 * 1024 * 1024) return null;
  return { inline_data: { mime_type: got.type, data: got.buf.toString('base64') } };
}

/** Same contract as core/pressing.mjs analyzeDiscPhoto. Throws on failure. */
async function analyzeVision({ imageUrls, discCount = 1, edition }) {
  const n = Math.max(1, Math.min(4, Math.floor(discCount) || 1));
  const urls = (imageUrls ?? []).filter(Boolean).slice(0, MAX_IMAGES);
  if (!urls.length) return null;

  const content = [];
  const attached = [];
  for (const url of urls) {
    const block = await asImageBlock(url);
    if (block) {
      content.push({ text: `image ${attached.length}:` }, block);
      attached.push(url);
    }
  }
  if (!attached.length) throw new Error('every candidate image failed to download');

  content.unshift({
    text: `These are product photos for a ${n}-disc vinyl release${edition ? ` (${edition})` : ''}. Find the ONE image that best shows the vinyl disc(s) — INCLUDING a packshot/mockup where the record(s) only PEEK OUT from behind the sleeve. For EACH of the ${n} discs, ordered LEFT TO RIGHT as they appear in that image, give the disc's FULL bounding circle as fractions of image width/height.
Return ONLY JSON (no markdown):
{"imageIndex": 0, "discs": [{"cx": 0.7, "cy": 0.5, "r": 0.3}]}
Rules:
- Pick the image where the disc(s) are most visible. If NO image shows any disc at all, return {"imageIndex": -1, "discs": []}.
- THE DISC MUST MATCH THE EDITION DESCRIBED ABOVE. If that description names a colour or finish (for example a splatter, a clear or a coloured pressing) and the disc you can see is plainly something else, such as a standard black record, that is the WRONG disc: return {"imageIndex": -1, "discs": []} instead of returning it. A release's photo gallery often contains other pressings. Returning the wrong one misrepresents the record being sold, which is worse than returning nothing.
- EXTRAPOLATE each disc's FULL circle from the visible arc — cx/cy/r MAY go below 0 or above 1 where the disc is hidden behind the sleeve or overlapped by another disc. Estimate the true centre and radius of the whole record, not just the visible sliver.
- Return the discs you can see, up to ${n}, strictly in left-to-right order.`,
  });

  let last;
  for (const model of MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        visionCalls++;
        const r = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI}`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: content }], generationConfig: { temperature: 0.1 } }),
            signal: AbortSignal.timeout(120_000),
          },
        );
        if (r.status === 429 || r.status >= 500) throw new Error(`${model} ${r.status}`);
        if (!r.ok) throw new Error(`${model} ${r.status}: ${(await r.text()).slice(0, 160)}`);
        const data = await r.json();
        const text = (data.candidates?.[0]?.content?.parts ?? []).map((x) => x.text ?? '').join('');
        const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? 'null');
        const idx = parsed?.imageIndex;
        if (!Number.isInteger(idx) || idx < 0 || idx >= attached.length) return null;  // an honest miss
        const circles = (Array.isArray(parsed.discs) ? parsed.discs : [])
          .map((d) => saneCircle(d))
          .filter(Boolean)
          .slice(0, n);
        if (!circles.length) return null;
        return { url: attached[idx], circles };
      } catch (err) {
        last = err;
        await new Promise((res) => setTimeout(res, 2500 * (attempt + 1)));
      }
    }
  }
  throw last ?? new Error('vision pass failed');
}

/* ── helpers ────────────────────────────────────────────────────────── */

const exists = (p) => access(p).then(() => true, () => false);

/** "2LP" -> 2. How many records are in the sleeve. */
const discsIn = (format) => {
  const m = /^(\d+)\s*LP$/i.exec(String(format || '').trim());
  return m ? Math.max(1, Math.min(4, Number(m[1]))) : 1;
};

/* Mirrors the vocabulary in core/disc-search.mjs, which keeps its regex
   private. Kept in step by hand; it is a word list, not logic. */
const COLOURS = /\b(orange|red|blue|green|yellow|purple|violet|pink|white|black|clear|gold|silver|bronze|amber|teal|cream|bone|ivory|grey|gray|magenta|turquoise|marbled?|splatter|galaxy|smoke|coke ?bottle|sea ?glass|olive|maroon|cobalt)\b/gi;

/** Every non-black colour/finish word in a string. Black is the default
 *  pressing, so naming it is not a claim about a variant. */
function colourSet(text) {
  const out = new Set();
  for (const m of String(text ?? '').matchAll(COLOURS)) {
    const w = m[0].toLowerCase().replace(/\s+/g, ' ');
    if (w !== 'black') out.add(w);
  }
  return out;
}

/**
 * Is the pressing Discogs handed us the pressing we are actually selling?
 *
 * THIS IS THE GUARD THAT WAS MISSING, and the first run proved why.
 * resolveDiscogsByText returns the first release by the right artist, which
 * for "Amazon Exclusive Bone White Vinyl" was a BABY BLUE pressing. We then
 * cropped its disc and were one commit away from showing a blue record to
 * somebody buying a bone white one.
 *
 * A photo of the wrong pressing is worse than no photo. No photo is honest
 * and the footer offers a real one; the wrong photo looks authoritative and
 * is a lie about the exact thing the buyer is paying extra for.
 *
 * So the colour claims have to AGREE. Both silent means a standard black
 * pressing on both sides, which is fine. Both naming the same colour is
 * fine. Anything else is unconfirmed, and unconfirmed means cover-only
 * until the owner pins the release with `discogs` in stock.json.
 */
function samePressing(ours, theirs) {
  const a = colourSet(ours);
  const b = colourSet(theirs);
  if (!a.size && !b.size) return { ok: true, why: 'neither names a colour' };
  for (const w of a) if (b.has(w)) return { ok: true, why: `both say ${w}` };
  const fmt = (s) => (s.size ? [...s].join('/') : 'nothing');
  return { ok: false, why: `we say ${fmt(a)}, Discogs says ${fmt(b)}` };
}

/**
 * Cut one disc out of a product photo and write it square, with everything
 * outside the circle transparent.
 *
 * The circle is EXTRAPOLATED, so it can run past the edge of the source
 * image wherever the record was hidden behind its sleeve. Those bands simply
 * stay transparent: they land on the tucked side and are never seen. The
 * in-bounds part is placed at its proportional offset at a single scale, so
 * the visible arc is never stretched to fill the gap.
 */
async function cutDisc(buf, circle, file) {
  const meta = await sharp(buf).metadata();
  const iw = meta.width;
  const ih = meta.height;
  // r is a fraction of the SHORTER side, matching the analyzer's convention
  const r = circle.r * Math.min(iw, ih);
  const box = 2 * r;
  const sx0 = circle.cx * iw - r;
  const sy0 = circle.cy * ih - r;

  // the part of that box the photo actually covers
  const ix0 = Math.max(0, Math.round(sx0));
  const iy0 = Math.max(0, Math.round(sy0));
  const ix1 = Math.min(iw, Math.round(sx0 + box));
  const iy1 = Math.min(ih, Math.round(sy0 + box));
  if (ix1 <= ix0 || iy1 <= iy0) return false;

  /*
    Place the in-bounds part at its proportional offset, at ONE scale, so
    the visible arc is never stretched to fill the gap.

    Everything here is clamped into the canvas. Each of w/h/left/top is
    rounded independently off a float, so a disc whose circle runs past the
    edge of the photo can land a pixel over and sharp refuses the whole
    composite ("Image to composite must have same dimensions or smaller").
    That is a crash on one record rather than a slightly wrong crop, so it
    is worth the four lines.
  */
  const k = PX / box;                       // source px -> output px, uniform
  const left = Math.min(PX - 1, Math.max(0, Math.round((ix0 - sx0) * k)));
  const top = Math.min(PX - 1, Math.max(0, Math.round((iy0 - sy0) * k)));
  const w = Math.max(1, Math.min(PX - left, Math.round((ix1 - ix0) * k)));
  const h = Math.max(1, Math.min(PX - top, Math.round((iy1 - iy0) * k)));

  const piece = await sharp(buf)
    .extract({ left: ix0, top: iy0, width: ix1 - ix0, height: iy1 - iy0 })
    .resize(w, h, { fit: 'fill' })
    .toBuffer();

  // a circular alpha mask, so the disc has a real edge rather than a square
  const mask = Buffer.from(
    `<svg width="${PX}" height="${PX}"><circle cx="${PX / 2}" cy="${PX / 2}" r="${PX / 2 - 1}" fill="#fff"/></svg>`,
  );

  await sharp({
    create: { width: PX, height: PX, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      { input: piece, left, top },
      { input: mask, blend: 'dest-in' },
    ])
    .png({ compressionLevel: 9 })
    .toFile(file);
  return true;
}

/**
 * Does the crop actually LOOK like the pressing the listing describes?
 *
 * The vision pass locates discs well and judges them badly. Told in plain
 * words that a "Green Glow In The Dark Splatter" edition must not return a
 * standard black record, it returned one anyway, out of a gallery of 39
 * photos that evidently contained both. Instructions are not a check.
 *
 * So this measures the pixels. It reads the playing surface only, skipping
 * the label and the transparent side, and asks one question: is this a
 * plain black record? Dark and unsaturated. If the edition names any colour
 * or finish at all and the answer is yes, the photo is of a different
 * pressing and gets thrown away.
 *
 * Deliberately only that one question. It is the failure that actually
 * happened and the one that is unambiguous; "is this the right SHADE of
 * green" is an eye's job, which is why the owner can pin a release.
 */
async function looksRight(file, edition) {
  if (!colourSet(edition).size) return { ok: true, why: 'plain pressing' };

  const { data, info } = await sharp(file)
    .resize(128, 128, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const c = info.width / 2;
  let n = 0, sumL = 0, sumS = 0;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * info.channels;
      if (data[i + 3] < 200) continue;                       // the tucked side
      const d = Math.hypot(x - c, y - c) / c;
      if (d < 0.40 || d > 0.95) continue;                    // label, and the rim
      const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      sumL += (mx + mn) / 2;
      sumS += mx === mn ? 0 : (mx - mn) / (1 - Math.abs(mx + mn - 1) || 1);
      n++;
    }
  }
  if (!n) return { ok: true, why: 'nothing measurable' };

  const L = sumL / n, S = sumS / n;
  if (L < 0.24 && S < 0.14) {
    return { ok: false, why: `photo is a plain black record (L ${L.toFixed(2)}, S ${S.toFixed(2)})` };
  }
  return { ok: true, why: `L ${L.toFixed(2)} S ${S.toFixed(2)}` };
}

/**
 * How far out this particular crop can be pulled before a hole shows.
 *
 * The main site tucks every photo disc to a fixed third of its width,
 * because a crop usually only holds the arc the camera saw and the rest of
 * the circle is transparent. That is a sound default for a product page
 * where the sleeve is one item in a grid.
 *
 * It is the wrong default HERE, where the record is the whole stage: a
 * complete disc photographed beside its sleeve got tucked away to a sliver
 * for a constraint it did not have. Underscores' crop is a whole record
 * with no transparent pixel in it.
 *
 * So measure instead of assume. The sleeve hides everything to the left, so
 * what matters is the leftmost column from which the disc is solid all the
 * way right. Return it normalised to the disc's radius:
 *
 *   -1  a complete record. Pull it right out.
 *    0  only the right half survived. Half out, no further.
 *
 * The renderer turns that into a distance; it owns the geometry.
 */
async function openFrom(file) {
  const S = 200;
  const { data, info } = await sharp(file).resize(S, S, { fit: 'fill' }).ensureAlpha().raw()
    .toBuffer({ resolveWithObject: true });
  const c = (S - 1) / 2;
  const rad = c * 0.95;              // inset, so the antialiased rim is not a hole
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
  return -1;                         // solid everywhere: a whole record
}

/**
 * Hunt the album's other pressings for OURS.
 *
 * The first version of this gave up far too early. resolveDiscogsByText
 * returns one release, the first by the right artist, and if that turned
 * out to be a baby blue pressing of a bone white record we stopped. The
 * brain's own sibling sweep is not much better for this job: it takes the
 * first six vinyl versions in whatever order Discogs lists them and never
 * asks which one is the record we are actually selling.
 *
 * A master usually has dozens of versions and the colour is right there in
 * each one's format string. So: pull the whole version list, rank it by how
 * well its colour words match our variant, and walk it best-first. The
 * first version that both claims our colour AND has a photo of a disc that
 * looks like it wins.
 *
 * That is the difference between "a record of this album" and "this record".
 */
async function pressingHunt(masterId, want, note) {
  const versions = [];
  for (let page = 1; page <= 3; page++) {
    let body;
    try {
      const r = await discogsGet(
        `https://api.discogs.com/masters/${masterId}/versions?per_page=100&page=${page}`,
        DISCOGS,
      );
      // Say why. A silent `catch { break }` here is the same mistake as the
      // analyser swallowing its 503s: an empty version list then reads as
      // "this album has no vinyl pressings", which is never true.
      if (!r?.ok) {
        if (note) note(`versions page ${page}: discogs ${r?.status ?? '?'}`);
        break;
      }
      body = await r.json();
    } catch (err) {
      if (note) note(`versions page ${page} failed: ${err.message}`);
      break;
    }
    versions.push(...(body.versions ?? []));
    if (page >= (body.pagination?.pages ?? 1)) break;
  }

  /* The versions list does NOT carry the vinyl colour. Its `format` is
     "LP, Album, Limited Edition, Numbered, Stereo" for the bone white
     pressing and for every other one; the colour lives in formats[0].text
     on the individual RELEASE. Ranking on the list alone therefore cannot
     work, and an earlier try at it found nothing for every record.

     So the list is only used to find the VINYL versions, and each one is
     then fetched to read its actual colour. Discogs allows 60 requests a
     minute and discogsGet paces itself, so this is bounded rather than
     free: BUDGET keeps a popular album with ninety pressings from taking
     all afternoon. */
  const BUDGET = 22;
  const vinyl = versions
    // A \b after a closing quote can never match, so the sizes anchor only
    // at the front. Discogs labels a 12" EP as `12", 45 RPM, EP`, with
    // neither "LP" nor "Vinyl" anywhere in it.
    .filter((v) => /\bLP\b|\bVinyl\b|\b(?:7|10|12)"/i.test(String(v.format ?? '')))
    .filter((v) => !/\b(file|aac|mp3|flac|wav|cdr?|cassette|dvd|blu-?ray|shm-?cd|digital|streaming)\b/i
      .test(String(v.format ?? '')))
    .slice(0, BUDGET);

  const scored = [];
  for (const v of vinyl) {
    let shaped;
    try {
      shaped = await fetchDiscogs(new URL(`https://www.discogs.com/release/${v.id}`), DISCOGS);
    } catch { continue; }
    if (!shaped?.images?.length) continue;          // no photos, nothing to look at
    const ed = shaped.edition || '';
    const has = colourSet(ed);
    let hit = 0;
    for (const w of want) if (has.has(w)) hit++;
    // every colour we claim must be present; a pressing that names a
    // different colour and none of ours is a different record
    const ok = want.size ? hit > 0 : has.size === 0;
    if (!ok) continue;
    scored.push({ shaped, score: hit * 10 - [...has].filter((w) => !want.has(w)).length,
                  why: `v${v.id} "${ed || 'no edition'}"` });
  }

  scored.sort((a, b) => b.score - a.score);
  if (note) note(`${versions.length} version(s), ${vinyl.length} vinyl, ${scored.length} claim our colour`);
  return scored.slice(0, 6);
}

/* ── main ───────────────────────────────────────────────────────────── */

const stock = JSON.parse(await readFile('stock.json', 'utf8'));
await mkdir(OUT, { recursive: true });

let ledger = {};
try { ledger = JSON.parse(await readFile(LEDGER, 'utf8')); } catch { /* first run */ }

let applied = 0, none = 0, skipped = 0, broke = 0;

for (const r of stock.records) {
  // A CD is a closed jewel case and never shows a disc. Nothing to resolve.
  if (r.format === 'CD') { skipped++; continue; }

  if (!force && ledger[r.id]) {
    console.log(`keep    ${r.id}`);
    skipped++;
    continue;
  }

  const n = discsIn(r.format);
  const want = colourSet(r.variant);

  /* Candidate pressings, best first.

     Pinned: exactly the one the owner named, no questions. Otherwise the
     seed release Discogs offers for the title, plus every version of the
     master whose own format string claims our colour, ranked. We then walk
     them until one actually yields a photo of a disc that looks like the
     record we are selling. */
  const tried = [];
  let candidates = [];

  if (r._photo) {
    /* The owner's own photograph, which outranks everything. This is the
       escape hatch the photo-only rule needs: when no pressing on Discogs
       has a usable picture of the record, or the ones that do are a
       different pressing, you photograph the thing on your own table. The
       analyser still runs, because finding the circle is geometry, but
       none of the is-this-ours guards do: you are holding it. */
    candidates = [{ shaped: { images: [r._photo], edition: r.variant || '' },
                    why: `owner photo ${r._photo}`, pinned: true }];
  } else if (r.discogs) {
    const pin = await fetchDiscogs(new URL(String(r.discogs)), DISCOGS);
    if (pin) candidates = [{ shaped: pin, why: 'pinned', pinned: true }];
  } else {
    const seed = await resolveDiscogsByText(
      { title: r.album, artist: r.artist, format: r.format }, DISCOGS,
    );
    if (seed?.masterId) {
      candidates = await pressingHunt(seed.masterId, want, (m) =>
        console.log(`        ${r.id}: ${m}`));
    } else if (seed && samePressing(r.variant, seed.edition || '').ok) {
      // no master to sweep, but the one release we have does claim our colour
      candidates = [{ shaped: seed, why: `seed "${seed.edition || 'no edition'}"` }];
    }
  }

  if (!candidates.length) {
    console.log(`NONE    ${r.id.padEnd(12)} no pressing of this album claims ${want.size ? [...want].join('/') : 'a plain pressing'}`);
    none++;
    continue;
  }

  let done = null, failed = null;

  for (const cand of candidates) {
    if (done) break;
    const shaped = cand.shaped;
    if (!shaped?.images?.length) continue;
    const edition = shaped.edition || r.variant || '';
    tried.push(cand.why);

    let found;
    try {
      found = await analyzeVision({ imageUrls: shaped.images, discCount: n, edition });
    } catch (err) {
      failed = err;
      continue;                       // a failed look is not a verdict
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

    // the crop exists: is it the record we are selling?
    const look = await looksRight(files[0], cand.pinned ? '' : edition);
    if (!look.ok) {
      for (const f of files) await rm(f, { force: true });
      continue;
    }

    let open = -1;
    for (const f of files) open = Math.max(open, await openFrom(f));
    done = { files, open, from: found.url, edition, why: cand.why };
  }

  if (!done) {
    if (failed) {
      console.log(`FAILED  ${r.id.padEnd(12)} vision pass never completed: ${failed.message}`);
      broke++;
    } else {
      console.log(`NONE    ${r.id.padEnd(12)} looked at ${tried.length} pressing(s), none showed our disc`);
      if (tried.length) console.log(`        tried: ${tried.slice(0, 4).join(' | ')}`);
      none++;
    }
    continue;
  }

  ledger[r.id] = {
    discs: done.files, open: done.open, source: 'catalog', from: done.from, edition: done.edition,
  };
  applied++;
  const how = done.open <= -0.98 ? 'whole record' : `solid from ${done.open.toFixed(2)}`;
  console.log(`OK      ${r.id.padEnd(12)} ${done.files.length} disc(s), ${how}  <- ${done.why}`);
}

await writeFile(LEDGER, JSON.stringify(ledger, null, 2) + '\n');

console.log(
  `\n${applied} applied, ${none} cover-only, ${broke} failed, ` +
    `${skipped} skipped (CD or already done)  [${visionCalls} vision calls]`,
);
if (none) {
  console.log('Cover-only is a normal outcome, not a failure: no pressing of that');
  console.log('album both claims our colour and has a photo of its disc. Pin the');
  console.log('exact release with "discogs" in stock.json if you know it.');
}
if (broke) {
  console.log('FAILED is different: nobody ever looked. Rerun before believing it.');
  process.exitCode = 1;
}
if (broke) {
  console.log('FAILED is different: nobody ever looked at those photos. Rerun before believing it.');
  process.exitCode = 1;
}
