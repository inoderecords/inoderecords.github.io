/**
 * Reads stock.json, writes index.html.
 *
 *   node build.mjs
 *
 * THE RULE THIS PAGE IS BUILT ON: the spectacle does the selling, and the
 * words stay plain.
 *
 * Three versions got this wrong before the current one, and all three are
 * worth remembering because each looked defensible while it was being built.
 *
 * The first made the INFORMATION clever, presenting stock as inodes and
 * blocks on a volume. It looked technical and it was unusable: nobody should
 * decode a metaphor to find out a record costs 2,500 pesos. Awwwards scores
 * usability at 30%, second only to design, and striking work loses ground
 * exactly where the purchase path goes murky.
 *
 * The second fixed the words and broke the picture. The copy went plain and
 * the ambition went into abstract instrument panels beside each row: a dial
 * reading the price position, rings counting copies, a seeded polygon per
 * record. Every line meant something. None of it answered the only question
 * a visitor has, which is what the record looks like.
 *
 * The third put the real cover art on a real 3D sleeve, which was right, and
 * then put five of them on one screen, which was not. Five covers, five
 * prices, five buttons and five sets of linework all at once means nothing is
 * the subject. A crate of records is not browsed that way by anyone.
 *
 * So now it is a crate. ONE record, centre stage, and you flip through it.
 * Whatever is in front of you is the subject, and everything else on the page
 * is either about that record or is how you get to the next one.
 *
 * THE PAGE SPEAKS IN ONE TYPEFACE. The visual language is the specimen
 * sheet: the record examined the way a type specimen examines a glyph, with
 * every caption in Obel Mono and hierarchy carried by weight. The fourth
 * version spoke in four families and read as parts from four different
 * sites; style.css carries the full reasoning.
 *
 * THE MARKUP IS STILL A LIST. Every record is in the HTML with its cover,
 * price and button. crate.js upgrades that list into the stage. With no
 * JavaScript you get all five stacked down the page and every one is
 * shoppable, which also means a Facebook crawler fetching a link preview
 * sees the whole shelf rather than one slide of a carousel.
 *
 * Fields beginning with an underscore in stock.json are the owner's notes
 * (landed cost, when to cut the price). They never reach the page: enforced
 * by `publicFields` and re-checked against the output below, not remembered.
 */
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

const peso = (n) => '₱' + n.toLocaleString('en-US');
const two = (n) => String(n).padStart(2, '0');

/**
 * The GCash email flow. `endpoint` is the FormSubmit alias that receives
 * orders (the random string from formsubmit.co, never the raw address, so
 * the inbox cannot be scraped off this public repo). While it is '' every
 * record falls back to the Messenger link, which is how the page shipped
 * before orders existed, and nothing else on the page changes.
 *
 * `site` is where FormSubmit's _next sends the buyer after the captcha. It
 * must be absolute; swap it for the domain when the DNS lands.
 *
 * `inbox` is where buyers send payment screenshots. It is split in two so
 * the address never sits in this repo or in any page as one
 * regex-matchable string; ordered.html assembles it with script, and the
 * no-script fallback is entity-encoded. Harvesters read whole strings.
 *
 * `gcash` is the account shown as text beside the QR on ordered.html,
 * injected by script for the same reason: the number is a phone number.
 * Buyers without script still have the QR, which carries everything.
 *
 * `claim` is the Supabase project behind supabase.sql: the shared shelf
 * that makes a double-sell impossible. The key is the anon key, public by
 * design. While `url` is '' the cart sells on the honor of the claim rule
 * alone, which is how the page worked before the shelf existed; with it
 * set, an order atomically takes the copy off the shelf for everyone, and
 * a claimed record shows CLAIMED before anyone can order it again.
 */
const ORDER = {
  endpoint: '8370b688e15b57aa52ccbeb88141ae9f',
  site: 'https://inoderecords.com',
  inbox: ['orders', 'inoderecords.com'],
  gcash: { number: '', name: '' },
  claim: { url: '', key: '' },
};

/* the disc glyph IS the O in the wordmark: the mark and the name are one
   word, per the brand sheet. Inline SVG because the Latin subset of the
   webfont has no ◉ and a fallback glyph from another family would put a
   second typeface on the page. */
const wordmark =
  `<span aria-hidden="true">IN<svg class="bar__o" viewBox="0 0 10 10">` +
  `<circle cx="5" cy="5" r="4.1" fill="none" stroke-width="1.2"/>` +
  `<circle class="bar__o-dot" cx="5" cy="5" r="1.6"/>` +
  `</svg>DERECORDS</span>`;

const publicFields = ['id', 'artist', 'album', 'variant', 'format', 'qty', 'price', 'hook'];

function checkRecord(r) {
  for (const k of Object.keys(r)) {
    if (k.startsWith('_')) continue;
    if (!publicFields.includes(k)) throw new Error(`${r.id}: unknown field "${k}"`);
  }
  for (const k of ['id', 'artist', 'album', 'format', 'qty', 'price']) {
    if (r[k] === undefined || r[k] === '') throw new Error(`${r.id}: missing "${k}"`);
  }
  if (!Number.isInteger(r.price) || r.price <= 0) {
    throw new Error(`${r.id}: price must be a positive integer`);
  }
}

/**
 * Which solid comes out of the sleeve.
 *
 * 0 black vinyl, 1 bone white, 2 splatter, 3 clear, 4 a closed jewel case.
 * CDs are ALWAYS the case and nothing ever slides out of one: we cannot
 * photograph the bare disc, so the site never draws one and implies we can.
 */
function variantOf(r) {
  if (r.format === 'CD') return 4;
  const v = (r.variant || '').toLowerCase();
  if (v.includes('splatter') || v.includes('marble') || v.includes('swirl')) return 2;
  if (v.includes('clear') || v.includes('transparent')) return 3;
  if (v.includes('white') || v.includes('bone') || v.includes('cream')) return 1;
  return 0;
}

/* ── what the record in the sleeve looks like ───────────────────────── */

/**
 * art/discs.json, written by disc.mjs: real photo crops, one per disc.
 *
 * THIS FILE DOES NOT DECIDE WHAT A RECORD LOOKS LIKE, and an earlier version
 * of it did. It read the variant string for colour words and built a
 * pressing out of them, which is the thing the house rule exists to stop:
 *
 *     "a word is not a look"
 *
 * Disc appearance is photo-only. A record with no photograph renders
 * cover-only and the page says so next to the stage, which is the honest
 * answer rather than a confident invention of the exact thing the buyer is
 * paying extra for.
 */
async function discs() {
  let ledger;
  try {
    ledger = JSON.parse(await readFile(join(HERE, 'art', 'discs.json'), 'utf8'));
  } catch {
    return new Map();
  }
  const byId = new Map();
  for (const [id, entry] of Object.entries(ledger)) {
    // `open` is how much of the disc the photograph actually holds, which
    // is what decides how far it can be pulled from the sleeve.
    if (entry?.discs?.length) {
      byId.set(id, { files: entry.discs, open: typeof entry.open === 'number' ? entry.open : 0 });
    }
  }
  return byId;
}

/**
 * art/manifest.json is written by art.mjs and maps one album slug to the
 * records that share it (Charli's LP and CD are one piece of artwork).
 *
 * A record with no artwork is not an error. The sleeve renders without a
 * texture and the record still sells, because the matcher refuses to guess
 * and "no confident match" is therefore a normal outcome.
 */
async function artwork() {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(join(HERE, 'art', 'manifest.json'), 'utf8'));
  } catch {
    return new Map();
  }
  const byId = new Map();
  for (const [slug, entry] of Object.entries(manifest)) {
    // One file, doing both jobs: the shader's texture and the plain <img>
    // shown with no WebGL. It is the cover as it actually looks.
    for (const id of entry.ids || []) byId.set(id, `art/${slug}.jpg`);
  }
  return byId;
}

/**
 * `style.css?v=a1b2c3d4` -- the file's own content hash.
 *
 * GitHub Pages serves these with a long cache, so every change to the
 * stylesheet or a script used to need a hard refresh to show up. Worse, the
 * HTML and its assets expire independently: a visitor could get new markup
 * driven by an old script. That cost real debugging time here, chasing a
 * shader fix that was never being loaded.
 *
 * The hash changes only when the file does, so the cache still works; it
 * just cannot serve a stale one.
 */
async function stamped(file) {
  try {
    const buf = await readFile(join(HERE, file));
    return `${file}?v=${createHash('sha256').update(buf).digest('hex').slice(0, 8)}`;
  } catch {
    return file;
  }
}

/* ── the order strip ────────────────────────────────────────────────── */

/**
 * Checkout, Vestigial style: the buyer leaves an email, gets an order
 * number, pays the GCash QR, and the shop confirms by reply. The gateway
 * comes later; this is the version of checkout a static page can do
 * honestly.
 *
 * <summary> is the buy button, so taking an order needs no script, and the
 * form is a plain POST to FormSubmit, whose free tier sends both mails:
 * the order to the shop inbox, the static confirmation back to the buyer.
 * order.js stamps the inode-styled order number in before the POST leaves.
 */
const titleOf = (r) =>
  `${r.artist} · ${r.album}` +
  (r.variant && r.variant !== r.format ? ` · ${r.variant}` : '') +
  ` · ${r.format}`;

function buyBlock(r, contact) {
  const amt =
    `<span class="rec__amt">${peso(r.price)}</span>` +
    (r.qty > 1 ? '<span class="rec__each">each</span>' : '');
  if (!ORDER.endpoint) {
    return `<p class="rec__buy">
              ${amt}
              <a class="btn btn--buy" href="${esc(contact.page)}"
                 aria-label="Message to buy ${esc(r.artist)}, ${esc(r.album)}">MESSAGE TO BUY</a>
            </p>`;
  }
  const title = titleOf(r);
  /* This text ships inside the public page as a hidden field, so it names
     no address and no number: those live behind ordered.html's script. */
  const reply =
    `We received your order: ${title}, ${peso(r.price)}. ` +
    'An order is a claim and the first confirmed payment gets the record. ' +
    'The payment steps, the GCash details, and where to send your screenshot ' +
    `are at ${ORDER.site}/ordered.html. INODERECORDS · Quezon City`;
  return `<div class="rec__buy">
              ${amt}
              <details class="order">
                <summary class="btn btn--buy"
                         aria-label="Buy ${esc(r.artist)}, ${esc(r.album)}">BUY</summary>
                <form class="order__form" method="POST"
                      action="https://formsubmit.co/${esc(ORDER.endpoint)}">
                  <input type="hidden" name="_subject" value="Order · ${esc(title)} · ${peso(r.price)}">
                  <input type="hidden" name="_template" value="table">
                  <input type="hidden" name="_next" value="${esc(ORDER.site)}/ordered.html">
                  <input type="hidden" name="_autoresponse" value="${esc(reply)}">
                  <input type="text" name="_honey" class="order__hp" tabindex="-1" autocomplete="off">
                  <input type="hidden" name="record" value="${esc(title)}">
                  <input type="hidden" name="price" value="${peso(r.price)}">
                  <input type="hidden" name="order" value="">
                  <label class="order__label" for="em-${esc(r.id)}">Your email</label>
                  <input class="order__email" id="em-${esc(r.id)}" type="email" name="email"
                         required autocomplete="email" placeholder="you@gmail.com">
                  <button class="btn btn--buy order__send" type="submit">PLACE ORDER</button>
                  <p class="order__claim">An order is a claim · first confirmed payment gets it</p>
                </form>
              </details>
            </div>`;
}

/* ── one record ─────────────────────────────────────────────────────── */

function card(r, contact, i, all, art, disc) {
  const a = art.get(r.id);
  const d = disc.get(r.id);
  const idx = `${two(i + 1)} / ${two(all.length)}`;
  /*
    Provenance, stated next to the object. The photo-only house rule is a
    promise worth money on a page asking a stranger for some: say plainly
    whether the disc on stage is a photograph of this pressing. crate.js
    mirrors these two lines into the readout beside the deck.
  */
  const prov =
    r.format === 'CD'
      ? ['CD · SEALED CASE', 'DISC NOT PICTURED']
      : d
        ? ['DISC · PHOTOGRAPHED', 'THIS PRESSING']
        : ['DISC · NOT PICTURED', 'REAL PHOTOS ON REQUEST'];
  return `          <li class="rec" id="${esc(r.id)}" data-variant="${variantOf(r)}"
              data-title="${esc(titleOf(r))}" data-price="${r.price}" data-qty="${r.qty}"
              data-prov1="${esc(prov[0])}" data-prov2="${esc(prov[1])}"
              ${d ? `data-discs="${d.files.join(',')}" data-open="${d.open}"` : ''}${
    a ? ` data-art="${a}"` : ''
  }>
${
  a
    ? `            <img class="rec__still" src="${a}" alt="${esc(r.artist)}, ${esc(r.album)}"` +
      ` width="640" height="640" decoding="async">\n`
    : ''
}            <p class="rec__idx" aria-hidden="true">${idx}</p>
            <p class="rec__tags">
              <span class="tag">${esc(r.format)}</span>
              <span class="tag">SEALED</span>
              <span class="tag tag--on">${r.qty > 1 ? `${r.qty} AVAILABLE` : 'ONLY 1'}</span>
            </p>
            <h2 class="rec__artist">${esc(r.artist)}</h2>
            <p class="rec__album">${esc(r.album)}</p>
            ${r.variant && r.variant !== r.format ? `<p class="rec__variant">${esc(r.variant)}</p>` : ''}
            ${r.hook ? `<p class="rec__hook">${esc(r.hook)}</p>` : ''}
            ${buyBlock(r, contact)}
          </li>`;
}

/* ── the page ───────────────────────────────────────────────────────── */

function page(stock, art, disc, v) {
  const { contact, records } = stock;
  records.forEach(checkRecord);

  const n = records.reduce((a, r) => a + r.qty, 0);
  const artists = records.map((r) => r.artist).filter((v, i, a) => a.indexOf(v) === i);
  const desc = `${n} brand new sealed records, in the Philippines now, shipping from Quezon City. ${artists.join(', ')}.`;

  /* The footer steps tell the truth about the current ordering mode: the
     email flow when the endpoint is wired, Messenger when it is not. */
  const how = ORDER.endpoint
    ? ['Order with your email', 'Pay via GCash', 'Reply with the screenshot, we ship']
    : ['Message us on Facebook', 'We send real photos of the actual copy', 'Pay and we ship'];

  /*
    The crate, seen edge on, with names. On a narrow screen each entry is a
    spine standing on a rail (the <i>); on a wide one the same buttons lay
    themselves out as a tracklist with dotted leaders to the prices, which
    is the position indicator, the shelf overview and direct navigation in
    one object. The accessible name stays on the button either way.
  */
  const dots = records
    .map(
      (r, i) =>
        `          <li><button type="button" data-go="${i}"` +
        ` aria-label="${esc(r.artist)}, ${esc(r.album)}, ${peso(r.price)}">` +
        `<i aria-hidden="true"></i>` +
        `<span class="crate__ix">${two(i + 1)}</span>` +
        `<span class="crate__who">${esc(r.artist)}</span>` +
        `<span class="crate__lead"></span>` +
        `<span class="crate__px">${peso(r.price)}</span>` +
        `</button></li>`,
    )
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0a0a0a">
<title>INODERECORDS · records in stock, Quezon City</title>
<meta name="description" content="${esc(desc)}">

<meta property="og:type" content="website">
<meta property="og:title" content="INODERECORDS · ${n} sealed records in stock">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="brand/og.png">
<meta name="twitter:card" content="summary_large_image">

<link rel="icon" href="brand/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="${v.css}">
</head>
<body${
    ORDER.claim.url
      ? ` data-claim-url="${esc(ORDER.claim.url)}" data-claim-key="${esc(ORDER.claim.key)}"`
      : ''
  }>

<div class="scan" aria-hidden="true"></div>
<div class="frame" aria-hidden="true"><i></i><i></i><i></i><i></i></div>

<header class="bar">
  <h1 class="bar__name" aria-label="INODERECORDS">${wordmark}</h1>
  <a class="bar__cta" href="${esc(contact.page)}">Message us</a>
</header>

<main class="shop">

  <!-- The list IS the page. crate.js turns it into the stage; without it
       every record is still here, stacked, with its cover and its price. -->
  <section class="crate" data-crate aria-roledescription="record crate">

    <div class="crate__stage">
      <canvas class="crate__canvas" aria-hidden="true"></canvas>
    </div>

    <div class="crate__deck">
      <!-- filled by crate.js from the current record's data-prov lines -->
      <p class="crate__prov" aria-hidden="true"><span data-prov-a></span><span data-prov-b></span></p>

      <ol class="crate__list">
${records.map((r, i) => card(r, contact, i, records, art, disc)).join('\n')}
      </ol>

      <!-- One control row, under the stage. The arrows used to float at the
           sides of the artwork, which put chrome on top of the dither and,
           on a phone where the record fills the width, put it behind the
           artwork instead. The sides of the stage are still tappable. -->
      <nav class="crate__nav" aria-label="Records">
        <button class="crate__arrow" type="button" data-step="-1">
          <span aria-hidden="true">&#8592;</span><span class="sr">Previous record</span>
        </button>
        <ol class="crate__dots">
${dots}
        </ol>
        <p class="crate__pos" aria-hidden="true"><span data-pos>01</span> / ${two(records.length)}</p>
        <button class="crate__arrow" type="button" data-step="1">
          <span aria-hidden="true">&#8594;</span><span class="sr">Next record</span>
        </button>
      </nav>
    </div>

  </section>

</main>

<!-- The specimen sheet ends in a data strip: the steps, then the facts,
     both in the same small voice as every other readout on the page. -->
<footer class="foot">
  <p class="foot__how">
${how.map((s) => `    <span>${esc(s)}</span>`).join('\n')}
  </p>
  <p class="foot__line">
    <span data-facts>${records.length} titles · ${n} copies · all sealed</span>
    <span>Quezon City · Philippines</span>
    <span>${esc(contact.shipping)}</span>
    <span>${esc(contact.meetup)}</span>
    <span>Updated ${esc(contact.updated)}</span>
    <span>Cover art · Cover Art Archive</span>
    <span>Disc photos · this pressing, not your copy</span>
  </p>
</footer>

<script src="${v.boot}" defer></script>
<script src="${v.crate}" defer></script>
${ORDER.endpoint ? `<script src="${v.order}" defer></script>\n<script src="${v.cart}" defer></script>\n` : ''}</body>
</html>
`;
}

/* ── ordered.html: where FormSubmit's _next lands the buyer ─────────── */

/**
 * The screen after the captcha. The order number cannot ride the redirect
 * (FormSubmit owns it), so order.js leaves it in sessionStorage on the way
 * out and the inline script below picks it up: same tab, so it survives
 * the round trip. Without JavaScript the page still says everything that
 * matters; it just cannot name the number, and the shop's reply does that.
 *
 * Built even while ordering is off, so the copy exists to read and style
 * before the endpoint does. Nothing links to it until then.
 */
function thanksPage(contact, v, hasQr) {
  /* Every character as a numeric entity: renders as the plain address, but
     an email regex over the raw HTML finds nothing. The script-built mailto
     covers everyone else. */
  const ent = (s) => s.replace(/./g, (c) => `&#${c.charCodeAt(0)};`);
  const entmail = ent(`${ORDER.inbox[0]}@${ORDER.inbox[1]}`);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0a0a0a">
<meta name="robots" content="noindex">
<title>INODERECORDS · order placed</title>
<link rel="icon" href="brand/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="${v.css}">
</head>
<body>

<div class="scan" aria-hidden="true"></div>
<div class="frame" aria-hidden="true"><i></i><i></i><i></i><i></i></div>

<header class="bar">
  <h1 class="bar__name" aria-label="INODERECORDS">${wordmark}</h1>
  <a class="bar__cta" href="${esc(contact.page)}">Message us</a>
</header>

<main class="done">
  <p class="done__hud">Order placed</p>
  <p class="done__ino" data-ino hidden><span></span></p>
  <p class="done__what" data-what hidden></p>
  <ol class="done__steps">
    <li>Check your inbox, spam folder included. Your order confirmation is there.</li>
    <li>${
      hasQr
        ? 'Pay the exact amount by scanning the GCash QR below<span data-pay></span>.'
        : 'We email you the GCash payment details from the shop address.'
    }</li>
    <li>Email your payment screenshot and your shipping address (Lalamove or LBC, shouldered by the buyer), or ask for a Quezon City meetup: <a class="done__mail" data-mail href="./">the shop address</a><noscript> &#183; ${entmail}</noscript></li>
  </ol>
${
  hasQr
    ? `  <img class="done__qr" src="pay/gcash.png" alt="GCash QR code for INODERECORDS" width="240" height="240">\n`
    : ''
}  <p class="done__claim">An order is a claim · the first confirmed payment gets the record</p>
  <a class="done__back" href="./">&#8592; Back to the records</a>
</main>

<script>
(function () {
  'use strict';
  try {
    var o = JSON.parse(sessionStorage.getItem('inode.order') || 'null');
    if (!o || !o.ino) return;
    var n = document.querySelector('[data-ino]');
    if (n) { n.firstElementChild.textContent = o.ino; n.hidden = false; }
    var w = document.querySelector('[data-what]');
    if (w && o.record) {
      w.textContent = o.record + (o.price ? ' · ' + o.price : '');
      w.hidden = false;
    }
  } catch (e) { /* storage blocked: the generic copy stands */ }
})();
(function () {
  'use strict';
  var P = ${JSON.stringify(ORDER.inbox)};
  var addr = P[0] + '\\u0040' + P[1];
  var m = document.querySelector('[data-mail]');
  if (m) { m.textContent = addr; m.setAttribute('href', 'mailto:' + addr); }
  var G = ${JSON.stringify(ORDER.gcash)};
  var p = document.querySelector('[data-pay]');
  if (p && G.number) {
    p.textContent = ', or send to ' + G.number + (G.name ? ' (' + G.name + ')' : '');
  }
})();
</script>
</body>
</html>
`;
}

/* ── run ────────────────────────────────────────────────────────────── */

const stock = JSON.parse(await readFile(join(HERE, 'stock.json'), 'utf8'));
const art = await artwork();
const disc = await discs();
const v = {
  css: await stamped('style.css'),
  boot: await stamped('boot.js'),
  crate: await stamped('crate.js'),
  order: await stamped('order.js'),
  cart: await stamped('cart.js'),
};
const html = page(stock, art, disc, v);
await writeFile(join(HERE, 'index.html'), html);

const hasQr = existsSync(join(HERE, 'pay', 'gcash.png'));
await writeFile(join(HERE, 'ordered.html'), thanksPage(stock.contact, v, hasQr));

for (const r of stock.records) {
  for (const [k, v] of Object.entries(r)) {
    if (k.startsWith('_') && html.includes(String(v))) {
      throw new Error(`owner-only field ${r.id}.${k} reached the page`);
    }
  }
}

console.log(
  `index.html  ${(Buffer.byteLength(html) / 1024).toFixed(1)} KB  ` +
    `${stock.records.length} records, ${stock.records.reduce((a, r) => a + r.qty, 0)} copies`,
);
console.log(
  ORDER.endpoint
    ? `orders      on: FormSubmit, ${hasQr ? 'GCash QR on ordered.html' : 'NO pay/gcash.png yet'}`
    : 'orders      off: buy is the Messenger link until ORDER.endpoint is set',
);
let coverOnly = 0;
for (const r of stock.records) {
  const a = art.get(r.id);
  const d = disc.get(r.id);
  const shown =
    r.format === 'CD' ? 'jewel case' : d ? `${d.files.length} disc photo` : 'cover only';
  if (!d && r.format !== 'CD') coverOnly++;
  console.log(`  ${r.id.padEnd(12)} ${shown.padEnd(14)} ${a || 'NO ARTWORK'}`);
}
if (coverOnly) {
  console.log(
    `\n${coverOnly} record(s) render cover-only: no confirmed photo of that pressing.\n` +
      'Run `node disc.mjs` to try, and pin the release with "discogs" in stock.json\n' +
      'when it reports the wrong pressing.',
  );
}
