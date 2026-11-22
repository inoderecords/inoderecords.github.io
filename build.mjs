import { existsSync } from "node:fs";

import { readFile, writeFile } from "node:fs/promises";

import { createHash } from "node:crypto";

import { dirname, join } from "node:path";

import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

const esc = s => String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
}[c]));

const peso = n => "₱" + n.toLocaleString("en-US");

const two = n => String(n).padStart(2, "0");

const ORDER = {
    endpoint: "8370b688e15b57aa52ccbeb88141ae9f",
    site: "https://inoderecords.com",
    inbox: [ "orders", "inoderecords.com" ],
    gcash: {
        number: "",
        name: ""
    },
    claim: {
        url: "https://dgfixbtziedvqzucxats.supabase.co",
        key: "sb_publishable_8c9aLOABXdfqwjv6c9bLAg_44bw0qZ2"
    }
};

const wordmark = `<span aria-hidden="true">IN<svg class="bar__o" viewBox="0 0 10 10">` + `<circle cx="5" cy="5" r="4.1" fill="none" stroke-width="1.2"/>` + `<circle class="bar__o-dot" cx="5" cy="5" r="1.6"/>` + `</svg>DERECORDS</span>`;

const publicFields = [ "id", "artist", "album", "variant", "format", "qty", "price", "hook" ];

function checkRecord(r) {
    for (const k of Object.keys(r)) {
        if (k.startsWith("_")) continue;
        if (!publicFields.includes(k)) throw new Error(`${r.id}: unknown field "${k}"`);
    }
    for (const k of [ "id", "artist", "album", "format", "qty", "price" ]) {
        if (r[k] === undefined || r[k] === "") throw new Error(`${r.id}: missing "${k}"`);
    }
    if (!Number.isInteger(r.price) || r.price <= 0) {
        throw new Error(`${r.id}: price must be a positive integer`);
    }
}

function variantOf(r) {
    if (r.format === "CD") return 4;
    const v = (r.variant || "").toLowerCase();
    if (v.includes("splatter") || v.includes("marble") || v.includes("swirl")) return 2;
    if (v.includes("clear") || v.includes("transparent")) return 3;
    if (v.includes("white") || v.includes("bone") || v.includes("cream")) return 1;
    return 0;
}

async function discs() {
    let ledger;
    try {
        ledger = JSON.parse(await readFile(join(HERE, "art", "discs.json"), "utf8"));
    } catch {
        return new Map;
    }
    const byId = new Map;
    for (const [id, entry] of Object.entries(ledger)) {
        if (entry?.discs?.length) {
            byId.set(id, {
                files: entry.discs,
                open: typeof entry.open === "number" ? entry.open : 0
            });
        }
    }
    return byId;
}

async function artwork() {
    let manifest;
    try {
        manifest = JSON.parse(await readFile(join(HERE, "art", "manifest.json"), "utf8"));
    } catch {
        return new Map;
    }
    const byId = new Map;
    for (const [slug, entry] of Object.entries(manifest)) {
        for (const id of entry.ids || []) byId.set(id, `art/${slug}.jpg`);
    }
    return byId;
}

async function stamped(file) {
    try {
        const buf = await readFile(join(HERE, file));
        return `${file}?v=${createHash("sha256").update(buf).digest("hex").slice(0, 8)}`;
    } catch {
        return file;
    }
}

const titleOf = r => `${r.artist} · ${r.album}` + (r.variant && r.variant !== r.format ? ` · ${r.variant}` : "") + ` · ${r.format}`;

function buyBlock(r, contact) {
    const amt = `<span class="rec__amt">${peso(r.price)}</span>` + (r.qty > 1 ? '<span class="rec__each">each</span>' : "");
    if (!ORDER.endpoint) {
        return `<p class="rec__buy">\n              ${amt}\n              <a class="btn btn--buy" href="${esc(contact.page)}"\n                 aria-label="Message to buy ${esc(r.artist)}, ${esc(r.album)}">MESSAGE TO BUY</a>\n            </p>`;
    }
    const title = titleOf(r);
    const reply = `We received your order: ${title}, ${peso(r.price)}. ` + "An order is a claim and the first confirmed payment gets the record. " + "The payment steps, the GCash details, and where to send your screenshot " + `are at ${ORDER.site}/ordered.html. INODERECORDS · Quezon City`;
    return `<div class="rec__buy">\n              ${amt}\n              <details class="order">\n                <summary class="btn btn--buy"\n                         aria-label="Buy ${esc(r.artist)}, ${esc(r.album)}">BUY</summary>\n                <form class="order__form" method="POST"\n                      action="https://formsubmit.co/${esc(ORDER.endpoint)}">\n                  <input type="hidden" name="_subject" value="Order · ${esc(title)} · ${peso(r.price)}">\n                  <input type="hidden" name="_template" value="table">\n                  <input type="hidden" name="_next" value="${esc(ORDER.site)}/ordered.html">\n                  <input type="hidden" name="_autoresponse" value="${esc(reply)}">\n                  <input type="text" name="_honey" class="order__hp" tabindex="-1" autocomplete="off">\n                  <input type="hidden" name="record" value="${esc(title)}">\n                  <input type="hidden" name="price" value="${peso(r.price)}">\n                  <input type="hidden" name="order" value="">\n                  <label class="order__label" for="em-${esc(r.id)}">Your email</label>\n                  <input class="order__email" id="em-${esc(r.id)}" type="email" name="email"\n                         required autocomplete="email" placeholder="you@gmail.com">\n                  <label class="order__label" for="nm-${esc(r.id)}">Your name</label>\n                  <input class="order__email" id="nm-${esc(r.id)}" type="text" name="name"\n                         required maxlength="120" autocomplete="name" placeholder="Juan Dela Cruz">\n                  <label class="order__label" for="ad-${esc(r.id)}">Ship to</label>\n                  <textarea class="order__email order__area" id="ad-${esc(r.id)}" name="address"\n                            required maxlength="500" autocomplete="street-address" rows="3"\n                            placeholder="Street · barangay · city (Lalamove or LBC, shouldered by you) · or say QC meetup"></textarea>\n                  <button class="btn btn--buy order__send" type="submit">PLACE ORDER</button>\n                  <p class="order__claim">An order is a claim · first confirmed payment gets it</p>\n                </form>\n              </details>\n            </div>`;
}

function card(r, contact, i, all, art, disc) {
    const a = art.get(r.id);
    const d = disc.get(r.id);
    const idx = `${two(i + 1)} / ${two(all.length)}`;
    const prov = r.format === "CD" ? [ "CD · SEALED CASE", "DISC NOT PICTURED" ] : d ? [ "DISC · PHOTOGRAPHED", "THIS PRESSING" ] : [ "DISC · NOT PICTURED", "REAL PHOTOS ON REQUEST" ];
    return `          <li class="rec" id="${esc(r.id)}" data-variant="${variantOf(r)}"\n              data-title="${esc(titleOf(r))}" data-price="${r.price}" data-qty="${r.qty}"\n              data-prov1="${esc(prov[0])}" data-prov2="${esc(prov[1])}"\n              ${d ? `data-discs="${d.files.join(",")}" data-open="${d.open}"` : ""}${a ? ` data-art="${a}"` : ""}>\n${a ? `            <img class="rec__still" src="${a}" alt="${esc(r.artist)}, ${esc(r.album)}"` + ` width="640" height="640" decoding="async">\n` : ""}            <p class="rec__idx" aria-hidden="true">${idx}</p>\n            <p class="rec__tags">\n              <span class="tag">${esc(r.format)}</span>\n              <span class="tag">SEALED</span>\n              <span class="tag tag--on">${r.qty > 1 ? `${r.qty} AVAILABLE` : "ONLY 1"}</span>\n            </p>\n            <h2 class="rec__artist">${esc(r.artist)}</h2>\n            <p class="rec__album">${esc(r.album)}</p>\n            ${r.variant && r.variant !== r.format ? `<p class="rec__variant">${esc(r.variant)}</p>` : ""}\n            ${r.hook ? `<p class="rec__hook">${esc(r.hook)}</p>` : ""}\n            ${buyBlock(r, contact)}\n          </li>`;
}

function page(stock, art, disc, v) {
    const {contact: contact, records: records} = stock;
    records.forEach(checkRecord);
    const n = records.reduce((a, r) => a + r.qty, 0);
    const artists = records.map(r => r.artist).filter((v, i, a) => a.indexOf(v) === i);
    const desc = `${n} brand new sealed records, in the Philippines now, shipping from Quezon City. ${artists.join(", ")}.`;
    const how = ORDER.endpoint ? [ "Order with your email", "Pay via GCash", "Reply with the screenshot, we ship" ] : [ "Message us on Facebook", "We send real photos of the actual copy", "Pay and we ship" ];
    const dots = records.map((r, i) => `          <li><button type="button" data-go="${i}"` + ` aria-label="${esc(r.artist)}, ${esc(r.album)}, ${peso(r.price)}">` + `<i aria-hidden="true"></i>` + `<span class="crate__ix">${two(i + 1)}</span>` + `<span class="crate__who">${esc(r.artist)}</span>` + `<span class="crate__lead"></span>` + `<span class="crate__px">${peso(r.price)}</span>` + `</button></li>`).join("\n");
    return `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<meta name="theme-color" content="#0a0a0a">\n<title>INODERECORDS · records in stock, Quezon City</title>\n<meta name="description" content="${esc(desc)}">\n\n<meta property="og:type" content="website">\n<meta property="og:title" content="INODERECORDS · ${n} sealed records in stock">\n<meta property="og:description" content="${esc(desc)}">\n<meta property="og:image" content="brand/og.png">\n<meta name="twitter:card" content="summary_large_image">\n\n<link rel="icon" href="brand/favicon.svg" type="image/svg+xml">\n<link rel="stylesheet" href="${v.css}">\n</head>\n<body${ORDER.claim.url ? ` data-claim-url="${esc(ORDER.claim.url)}" data-claim-key="${esc(ORDER.claim.key)}"` : ""}>\n\n<div class="scan" aria-hidden="true"></div>\n<div class="frame" aria-hidden="true"><i></i><i></i><i></i><i></i></div>\n\n<header class="bar">\n  <h1 class="bar__name" aria-label="INODERECORDS">${wordmark}</h1>\n  <a class="bar__cta" href="${esc(contact.page)}">Message us</a>\n</header>\n\n<main class="shop">\n\n  \n  <section class="crate" data-crate aria-roledescription="record crate">\n\n    <div class="crate__stage">\n      <canvas class="crate__canvas" aria-hidden="true"></canvas>\n    </div>\n\n    <div class="crate__deck">\n      \n      <p class="crate__prov" aria-hidden="true"><span data-prov-a></span><span data-prov-b></span></p>\n\n      <ol class="crate__list">\n${records.map((r, i) => card(r, contact, i, records, art, disc)).join("\n")}\n      </ol>\n\n      \n      <nav class="crate__nav" aria-label="Records">\n        <button class="crate__arrow" type="button" data-step="-1">\n          <span aria-hidden="true">&#8592;</span><span class="sr">Previous record</span>\n        </button>\n        <ol class="crate__dots">\n${dots}\n        </ol>\n        <p class="crate__pos" aria-hidden="true"><span data-pos>01</span> / ${two(records.length)}</p>\n        <button class="crate__arrow" type="button" data-step="1">\n          <span aria-hidden="true">&#8594;</span><span class="sr">Next record</span>\n        </button>\n      </nav>\n    </div>\n\n  </section>\n\n</main>\n\n\n<footer class="foot">\n  <p class="foot__how">\n${how.map(s => `    <span>${esc(s)}</span>`).join("\n")}\n  </p>\n  <p class="foot__line">\n    <span data-facts>${records.length} titles · ${n} copies · all sealed</span>\n    <span>Quezon City · Philippines</span>\n    <span>${esc(contact.shipping)}</span>\n    <span>${esc(contact.meetup)}</span>\n    <span>Updated ${esc(contact.updated)}</span>\n    <span>Cover art · Cover Art Archive</span>\n    <span>Disc photos · this pressing, not your copy</span>\n  </p>\n</footer>\n\n<script src="${v.boot}" defer><\/script>\n<script src="${v.crate}" defer><\/script>\n${ORDER.endpoint ? `<script src="${v.order}" defer><\/script>\n<script src="${v.cart}" defer><\/script>\n` : ""}</body>\n</html>\n`;
}

function thanksPage(contact, v, hasQr) {
    const ent = s => s.replace(/./g, c => `&#${c.charCodeAt(0)};`);
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

  <section data-order hidden>
    <p class="done__hud">Order placed</p>
    <p class="done__ino" data-ino><span></span></p>
    <p class="done__what" data-what></p>
    <p class="done__payhud">Pay exactly</p>
    <p class="done__total" data-total></p>
${hasQr ? `    <img class="done__qr" src="pay/gcash.png" alt="GCash QR code for INODERECORDS" width="240" height="240">
    <p class="done__paynote">GCash · scan with your app<span data-pay></span></p>
` : `    <p class="done__paynote">We email you the GCash payment details from the shop address.</p>
`}    <ol class="done__steps">
      <li>Your confirmation email repeats everything on this page. Inbox or spam.</li>
      <li>Reply to it with your payment screenshot. We confirm, then we ship. No email anywhere? Send the screenshot to <a class="done__mail" data-mail href="./">the shop address</a>.</li>
    </ol>
    <p class="done__claim">An order is a claim · the first confirmed payment gets the record</p>
  </section>

  <section data-noorder hidden>
    <p class="done__hud">No order on this device</p>
    <p class="done__nonetext">This page shows the payment step for an order placed in this browser, and there is none here. If you ordered, your confirmation email carries everything: the records, the exact total, and the payment steps.</p>
  </section>

  <noscript>
    <p class="done__hud">Order placed</p>
    <p class="done__nonetext">Your confirmation email carries everything: the records, the exact total, and the payment steps. Reply to it with your GCash payment screenshot&nbsp;· ${entmail}</p>
  </noscript>

  <a class="done__back" href="./">&#8592; Back to the records</a>
</main>

<script>
(function () {
  'use strict';
  var o = null;
  try { o = JSON.parse(sessionStorage.getItem('inode.order') || 'null'); } catch (e) {}
  var yes = document.querySelector('[data-order]');
  var no = document.querySelector('[data-noorder]');
  if (o && o.ino) {
    yes.hidden = false;
    document.querySelector('[data-ino]').firstElementChild.textContent = o.ino;
    if (o.record) document.querySelector('[data-what]').textContent = o.record;
    var t = document.querySelector('[data-total]');
    t.textContent = o.price || '';
    if (!o.price) {
      t.hidden = true;
      document.querySelector('.done__payhud').hidden = true;
    }
  } else {
    no.hidden = false;
  }
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
    p.textContent = ' · or send to ' + G.number + (G.name ? ' (' + G.name + ')' : '');
  }
})();
<\/script>
</body>
</html>
`;
}

const stock = JSON.parse(await readFile(join(HERE, "stock.json"), "utf8"));

const art = await artwork();

const disc = await discs();

const v = {
    css: await stamped("style.css"),
    boot: await stamped("boot.js"),
    crate: await stamped("crate.js"),
    order: await stamped("order.js"),
    cart: await stamped("cart.js")
};

const html = page(stock, art, disc, v);

await writeFile(join(HERE, "index.html"), html);

const hasQr = existsSync(join(HERE, "pay", "gcash.png"));

await writeFile(join(HERE, "ordered.html"), thanksPage(stock.contact, v, hasQr));

for (const r of stock.records) {
    for (const [k, v] of Object.entries(r)) {
        if (k.startsWith("_") && html.includes(String(v))) {
            throw new Error(`owner-only field ${r.id}.${k} reached the page`);
        }
    }
}

console.log(`index.html  ${(Buffer.byteLength(html) / 1024).toFixed(1)} KB  ` + `${stock.records.length} records, ${stock.records.reduce((a, r) => a + r.qty, 0)} copies`);

console.log(ORDER.endpoint ? `orders      on: FormSubmit, ${hasQr ? "GCash QR on ordered.html" : "NO pay/gcash.png yet"}` : "orders      off: buy is the Messenger link until ORDER.endpoint is set");

let coverOnly = 0;

for (const r of stock.records) {
    const a = art.get(r.id);
    const d = disc.get(r.id);
    const shown = r.format === "CD" ? "jewel case" : d ? `${d.files.length} disc photo` : "cover only";
    if (!d && r.format !== "CD") coverOnly++;
    console.log(`  ${r.id.padEnd(12)} ${shown.padEnd(14)} ${a || "NO ARTWORK"}`);
}

if (coverOnly) {
    console.log(`\n${coverOnly} record(s) render cover-only: no confirmed photo of that pressing.\n` + 'Run `node disc.mjs` to try, and pin the release with "discogs" in stock.json\n' + "when it reports the wrong pressing.");
}