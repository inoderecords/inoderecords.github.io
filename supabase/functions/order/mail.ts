export type Row = { artist: string; album: string; detail: string; price: string; art: string };
export type Way = { label: string; fee: number | null; next: string };
export type Order = {
  site: string;
  page: string;
  ino: string;
  total: string;
  when: string;
  rows: Row[];
  delivery: Way | null;
  name: string;
  phone: string;
  address: string;
  buyer: string;
};

const INK = '#0a0a0a';
const PAPER = '#f4f3ef';
const SOFT = '#d3d2cf';
const DIM = '#92918f';
const FAINT = '#50504f';
const F = "'Obel Mono',ui-monospace,'SF Mono',SFMono-Regular,Menlo,'Cascadia Mono','Segoe UI Mono',Consolas,'Roboto Mono','Liberation Mono',monospace";
const ART = /^art\/[A-Za-z0-9._-]+\.(jpg|jpeg|png)$/;

export const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const br = (s: string) => esc(s).replace(/\n/g, '<br>');
export const feeOf = (fee: number | null) => (fee ? `₱${fee.toLocaleString('en-US')}` : 'Free');

const td = (style: string, html: string, attrs = '') => `<td${attrs} style="font-family:${F};${style}">${html}</td>`;
const grid = (rows: string, wide = true) =>
  `<table role="presentation"${wide ? ' width="100%"' : ''} cellpadding="0" cellspacing="0" border="0">${rows}</table>`;
const wrap = (html: string, pad = '0') => `<tr><td style="padding:${pad};">${html}</td></tr>`;
const hud = (text: string, pad: string) =>
  `<tr>${td(`padding:${pad};font-size:11px;line-height:1.5;letter-spacing:2.5px;color:${DIM};`, text)}</tr>`;
const prose = (html: string, pad: string, size = 14, color = SOFT) =>
  `<tr>${td(`padding:${pad};font-size:${size}px;line-height:1.65;color:${color};`, html)}</tr>`;

const signal = (o: Order) =>
  `<img src="${o.site}/brand/mail-signal.png" width="280" height="8" alt="" style="display:block;width:280px;height:8px;border:0;">`;
const tile = (o: Order) =>
  `<img src="${o.site}/brand/mail-tile.png" width="56" height="56" alt="" style="display:block;width:56px;height:56px;border:0;">`;

const head = (o: Order, right: string) =>
  wrap(grid(`<tr><td valign="middle">` +
    `<img src="${o.site}/brand/mail-wordmark.png" width="146" height="21" alt="INODERECORDS" ` +
    `style="display:block;width:146px;height:21px;border:0;font-family:${F};font-size:14px;font-weight:800;letter-spacing:2px;color:${PAPER};">` +
    `</td>${td(`font-size:11px;letter-spacing:1px;color:${DIM};white-space:nowrap;`, right, ' valign="middle" align="right"')}</tr>`), '0 0 22px') +
  wrap(signal(o), '0 0 32px');

const foot = (o: Order, note: string) =>
  wrap(signal(o), '44px 0 18px') +
  prose(note, '0 0 10px', 12) +
  `<tr>${td(`font-size:10px;line-height:1.6;letter-spacing:2.5px;color:${DIM};`,
    `INODERECORDS &#183; QUEZON CITY &#183; <a href="${o.site}" style="color:${DIM};text-decoration:none;">INODERECORDS.COM</a>`)}</tr>`;

const items = (o: Order) => {
  const line = (pic: string, what: string, price: string) =>
    wrap(grid(`<tr><td width="56" valign="top" style="padding:0 16px 0 0;width:56px;">${pic}</td>` +
      td(`font-size:13px;line-height:1.5;color:${PAPER};`, what, ' valign="top"') +
      td(`padding:0 0 0 12px;font-size:13px;line-height:1.5;font-weight:700;color:${PAPER};white-space:nowrap;`, price, ' valign="top" align="right"') +
      `</tr>`), '0 0 16px');
  const cover = (r: Row) => ART.test(r.art)
    ? `<img src="${o.site}/${r.art}" width="56" height="56" alt="" style="display:block;width:56px;height:56px;border:0;">`
    : tile(o);
  return o.rows.map((r) => line(cover(r),
    `<div style="font-weight:800;letter-spacing:1.5px;text-transform:uppercase;">${esc(r.artist)}</div>` +
    (r.album ? `<div>${esc(r.album)}</div>` : '') +
    (r.detail ? `<div style="padding-top:2px;font-size:11px;color:${DIM};">${esc(r.detail)}</div>` : ''),
    esc(r.price))).join('') +
    (o.delivery
      ? line(tile(o), `<div style="font-size:11px;letter-spacing:2.5px;color:${DIM};">DELIVERY</div><div>${esc(o.delivery.label)}</div>`,
        esc(feeOf(o.delivery.fee)))
      : '');
};

const sum = (o: Order) =>
  wrap(grid(`<tr>` +
    td(`border-top:1px dotted ${FAINT};padding:15px 0 0;font-size:11px;letter-spacing:2.5px;color:${DIM};`, 'TOTAL', ' valign="top"') +
    td(`border-top:1px dotted ${FAINT};padding:12px 0 0;font-size:18px;line-height:1.3;font-weight:800;color:${PAPER};white-space:nowrap;`, esc(o.total), ' valign="top" align="right"') +
    `</tr>`), '2px 0 0');

const skin = (o: Order, pre: string, body: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
  `<meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark">` +
  `<title>INODERECORDS</title>` +
  `<style>:root{color-scheme:dark;supported-color-schemes:dark}body{margin:0;padding:0;background:${INK};}` +
  `a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important;}u+#body a{color:inherit;text-decoration:none;}` +
  `@media (max-width:480px){.big{font-size:40px!important;}}</style>` +
  `<style>@font-face{font-family:'Obel Mono';font-style:normal;font-weight:100 900;src:url(${o.site}/fonts/obel-mono-latin-vf.woff2) format('woff2');}</style>` +
  `</head><body id="body" style="margin:0;padding:0;background:${INK};" bgcolor="${INK}">` +
  `<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;">${esc(pre)}${'&#8199;&#847;'.repeat(40)}</div>` +
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${INK}" style="background:${INK};">` +
  `<tr><td align="center" style="padding:32px 18px 48px;">` +
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">` +
  body +
  `</table></td></tr></table></body></html>`;

export function buyerMail(o: Order) {
  const total = esc(o.total);
  const next = o.delivery?.next || 'We’ll email you the delivery details.';
  const shipTo = [o.name, o.phone, o.address].filter(Boolean).join('\n');
  const steps = [
    `Scan the QR and pay exactly <b style="color:${PAPER};">${total}</b>.`,
    'Screenshot the receipt.',
    'Reply to this email with the screenshot, and we&#8217;ll confirm and ship it out.',
  ];
  const html = skin(o, `Pay exactly ${o.total} by ${o.when}. Your QR is inside.`,
    head(o, esc(o.ino)) +
    hud('THANK YOU &#183; ORDER PLACED', '0 0 22px') +
    hud('PAY EXACTLY', '0 0 2px') +
    `<tr>${td(`padding:0 0 14px;font-size:48px;line-height:1.08;font-weight:800;letter-spacing:1px;color:${PAPER};`, total, ' class="big"')}</tr>` +
    prose(`We&#8217;re holding your records until <b style="color:${PAPER};">${esc(o.when)}</b>, Philippine time. After that, unpaid records go back on the shelf.`, '0 0 28px') +
    wrap(grid(`<tr><td bgcolor="#ffffff" style="background:#ffffff;padding:14px;">` +
      `<img src="${o.site}/pay/gcash.png?v=color" width="200" height="200" alt="InstaPay QR, also attached to this email" ` +
      `style="display:block;width:200px;height:200px;border:0;font-family:${F};font-size:12px;color:${INK};"></td></tr>`, false)) +
    hud('INSTAPAY QR &#183; GCASH, MAYA AND BANK APPS', '14px 0 4px') +
    prose('On your phone? The QR is attached to this email too. Save it, then upload it in your app&#8217;s QR scanner.', '0 0 36px', 12, DIM) +
    hud('HOW TO PAY', '0 0 14px') +
    wrap(grid(steps.map((s, i) => `<tr>` +
      `<td valign="top" width="32" style="padding:0 14px 14px 0;width:32px;">` +
      grid(`<tr>${td(`width:32px;height:24px;font-size:12px;line-height:24px;font-weight:800;letter-spacing:1px;color:${INK};background:${PAPER};`,
        `0${i + 1}`, ` width="32" height="24" align="center" valign="middle" bgcolor="${PAPER}"`)}</tr>`, false) +
      `</td>` +
      td(`padding:1px 0 14px;font-size:14px;line-height:1.6;color:${PAPER};`, s, ' valign="top"') +
      `</tr>`).join('')), '0 0 30px') +
    hud(`YOUR ORDER &#183; ${esc(o.ino)}`, '0 0 16px') +
    items(o) +
    sum(o) +
    prose(esc(next), '26px 0 0', 13) +
    hud('SHIP TO', '30px 0 8px') +
    prose(br(shipTo), '0', 13, PAPER) +
    foot(o, `Questions? <a href="${esc(o.page)}" style="color:${PAPER};text-decoration:underline;">Message us on Facebook</a>, or just reply to this email. We&#8217;re happy to help.`));
  const what = o.rows.map((r) => [r.artist, r.album, r.detail, r.price].filter(Boolean).join(' · ')).join('\n');
  const dLine = o.delivery ? `\nDelivery: ${o.delivery.label} · ${feeOf(o.delivery.fee)}` : '';
  const text = `Thanks for your order! Order number: ${o.ino}

Pay exactly ${o.total}.
We’re holding your records until ${o.when}, Philippine time. After that, unpaid records go back on the shelf.

01  Scan the QR with GCash, Maya or any bank app and pay exactly ${o.total}. The QR is attached to this email.
02  Screenshot the receipt.
03  Reply to this email with the screenshot, and we’ll confirm and ship it out.

Your order
${what}${dLine}
Total ${o.total}

${next}

Ship to
${shipTo}

Questions? Message us on Facebook (${o.page}), or just reply to this email. We’re happy to help.
INODERECORDS · Quezon City
${o.site}`;
  return { html, text };
}

export function shopMail(o: Order) {
  const html = skin(o, `${o.name} ordered. ${o.total}.`,
    head(o, esc(o.ino)) +
    hud(`NEW ORDER &#183; ${esc(o.ino)}`, '0 0 2px') +
    `<tr>${td(`padding:0 0 12px;font-size:40px;line-height:1.08;font-weight:800;letter-spacing:1px;color:${PAPER};`, esc(o.total))}</tr>` +
    prose(`Reserved until <b style="color:${PAPER};">${esc(o.when)}</b>. Unpaid, it goes back on sale after that.`, '0 0 30px', 13) +
    items(o) +
    sum(o) +
    hud('BUYER', '30px 0 8px') +
    prose(`${esc(o.name)}<br><a href="mailto:${esc(o.buyer)}" style="color:${PAPER};">${esc(o.buyer)}</a>${o.phone ? `<br>${esc(o.phone)}` : ''}`, '0', 13, PAPER) +
    hud('SHIP TO', '24px 0 8px') +
    prose(br(o.address), '0', 13, PAPER) +
    foot(o, 'Mark the claim confirmed in Supabase once the GCash payment lands.'));
  const what = o.rows.map((r) => [r.artist, r.album, r.detail, r.price].filter(Boolean).join(' · ')).join('\n');
  const dLine = o.delivery ? `\nDelivery: ${o.delivery.label} · ${feeOf(o.delivery.fee)}` : '';
  const text = `${o.ino}
${what}${dLine}
Total ${o.total}
Reserved until ${o.when}

Buyer: ${o.name} <${o.buyer}>${o.phone ? `\nMobile: ${o.phone}` : ''}
Ship to: ${o.address}

Mark the claim confirmed in Supabase once the GCash payment lands.`;
  return { html, text };
}
