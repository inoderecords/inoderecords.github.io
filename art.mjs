/*
  Cover art: fetch the canonical artwork for everything in stock.

  ONE FILE PER ALBUM, IN COLOUR. The cover is the real thing, as it actually
  looks, and it is the only colour on the page: the shell around it stays
  stark monochrome, so the product is the thing your eye lands on.

  This used to write two monochrome files, because the page showed every
  cover permanently dithered. That was the identity applied to the one thing
  on the page that should not have been stylised. A buyer deciding whether to
  send a stranger money needs to RECOGNISE the record, and a 1-bit cover is
  a good-looking thing to have to decode.

  The dither did not go away, it stopped being the resting state. crate.js
  still dithers the cover live, with an ordered Bayer matrix, while a record
  is arriving: the artwork resolves out of the pattern into the photograph
  and then stays the photograph. Making it the transition rather than the
  destination is what lets it be the brand without being in the way.

  So this writes one file, used both as the shader's texture and as the plain
  <img> a visitor sees with no WebGL and no JavaScript. The shader takes the
  luminance of it for the dithered half of that transition, which is why
  there is no separate grayscale file to keep in step any more.

  WHERE THE ART COMES FROM. core/coverart.mjs, the brain's existing matcher:
  MusicBrainz release-group plus the Cover Art Archive. That is the artwork
  contributed against the album, not a shop's photograph of a shrink-wrapped
  product, which matters because a packshot has an obi strip and a price
  sticker in it. It refuses rather than guesses, so a wrong cover does not
  quietly end up on a record.

  RUNNING IT. This tool needs the main checkout next door, for the matcher and
  for sharp. The shop repo itself has no dependencies and never will: what
  this writes is committed, so a fresh clone builds the page with nothing
  installed. You only run this when a record joins the shelf.

      node art.mjs

  It skips an album whose file already exists. Pass --force to refetch.
*/

import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

/* The brain, next door. Only this tool reaches across; the page does not. */
const BRAIN = path.resolve('..', 'inoderecords');
const CORE = pathToFileURL(path.join(BRAIN, 'packages', 'agent', 'core')).href + '/';

const OUT = 'art';

// Big enough that the cover still reads on a large desktop stage, small
// enough that five of them do not dominate a page whose audience is on
// mobile data deciding whether to trust a stranger on Marketplace.
const PX = 640;
const QUALITY = 82;

const force = process.argv.includes('--force');

/* ── the brain, loaded with a real message when it is not there ─────── */

let findCoverArt, mbSearch, sharp;
try {
  ({ findCoverArt } = await import(CORE + 'coverart.mjs'));
  ({ mbSearch } = await import(CORE + 'feeds.mjs'));
  sharp = createRequire(path.join(BRAIN, 'package.json'))('sharp');
} catch (err) {
  console.error(`
art.mjs needs the main checkout beside this one, at:
  ${BRAIN}

It borrows the cover matcher (packages/agent/core/coverart.mjs) and sharp from
there rather than keeping a second copy. The committed PNGs in ${OUT}/ mean you
do not need any of this to build the page -- only to add a new record.

  ${err.message}
`);
  process.exit(1);
}

/* ── one slug per album, not per record ─────────────────────────────── */

/** Charli's LP and CD are one album and one piece of artwork. */
export const albumSlug = (artist, album) =>
  `${artist} ${album}`
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/* ── fetchers ───────────────────────────────────────────────────────── */

const UA = 'INODERECORDS/0.1 (tech@skysharelabs.com)';

/** Does this Cover Art Archive image exist? */
async function headOk(url) {
  try {
    const r = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      headers: { 'user-agent': UA },
      signal: AbortSignal.timeout(20_000),
    });
    return r.ok;
  } catch {
    return false;
  }
}

/**
 * MusicBrainz answers a burst with "currently busy" rather than a 503, and
 * coverart.mjs turns any throw into a null -- which reads identically to "this
 * album has no art". That cost me a wrong conclusion once already: Chat Pile
 * looked artless when the artwork was there all along. So retry, and keep the
 * two outcomes apart.
 */
async function patientSearch(query, limit, entity) {
  let last;
  for (let i = 0; i < 4; i++) {
    try {
      const body = await mbSearch(query, limit, entity);
      if (body?.error) throw new Error(body.error);
      return body;
    } catch (err) {
      last = err;
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw last;
}

/* ── the cover ──────────────────────────────────────────────────────── */

/**
 * The artwork, as it actually looks.
 *
 * Deliberately NOT normalised or gamma-shifted any more. The old pipeline
 * stretched the levels because the result was about to be crushed to two
 * inks and needed the contrast to survive it. Shown as a photograph, that
 * same stretch is just somebody else's cover art with the exposure pushed.
 *
 * Square-cropped, because a sleeve is square and the shader maps the whole
 * face. A cover that is not square gets centre-cropped rather than squashed.
 */
async function writeCover(buf, file) {
  await sharp(buf)
    .resize(PX, PX, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: QUALITY, mozjpeg: true, chromaSubsampling: '4:2:0' })
    .toFile(file);
}

/* ── main ───────────────────────────────────────────────────────────── */

const exists = (p) => access(p).then(() => true, () => false);

const stock = JSON.parse(await readFile('stock.json', 'utf8'));
await mkdir(OUT, { recursive: true });

// one entry per album, carrying the records that share it
const albums = new Map();
for (const r of stock.records) {
  const slug = albumSlug(r.artist, r.album);
  if (!albums.has(slug)) albums.set(slug, { slug, artist: r.artist, album: r.album, ids: [] });
  albums.get(slug).ids.push(r.id);
}

const manifest = {};
let fetched = 0;
let kept = 0;
const missing = [];

for (const a of albums.values()) {
  const cover = path.join(OUT, `${a.slug}.jpg`);

  if (!force && (await exists(cover))) {
    manifest[a.slug] = { artist: a.artist, album: a.album, ids: a.ids };
    kept++;
    console.log(`keep   ${a.slug}`);
    continue;
  }

  let hit = null;
  try {
    hit = await findCoverArt(
      { artist: a.artist, title: a.album },
      { mbSearch: patientSearch, headOk },
    );
  } catch (err) {
    console.error(`ERROR  ${a.slug}  musicbrainz unreachable: ${err.message}`);
    missing.push(a.slug);
    continue;
  }

  if (!hit) {
    // Deliberately not a guess. A wrong cover is worse than no cover: it
    // misrepresents the thing we are selling.
    console.error(`MISS   ${a.slug}  no confident match -- paste a cover into ${cover} by hand`);
    missing.push(a.slug);
    continue;
  }

  const res = await fetch(hit.url, { redirect: 'follow', headers: { 'user-agent': UA }, signal: AbortSignal.timeout(45_000) });
  if (!res.ok) {
    console.error(`ERROR  ${a.slug}  cover art archive ${res.status}`);
    missing.push(a.slug);
    continue;
  }
  const buf = Buffer.from(await res.arrayBuffer());

  await writeCover(buf, cover);

  manifest[a.slug] = { artist: a.artist, album: a.album, ids: a.ids, mbid: hit.mbid, year: hit.year };
  fetched++;
  const kb = ((await import('node:fs')).statSync(cover).size / 1024).toFixed(0);
  console.log(`fetch  ${a.slug}  ${kb} KB  mb=${hit.mbid} year=${hit.year}`);
}

await writeFile(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

console.log(`\n${fetched} fetched, ${kept} already on disk, ${missing.length} missing`);
if (missing.length) {
  console.log(`missing: ${missing.join(', ')}`);
  console.log('The page renders without them -- the sleeve just shows no artwork.');
}
