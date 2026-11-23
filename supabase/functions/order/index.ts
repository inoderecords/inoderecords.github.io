import { createClient } from 'npm:@supabase/supabase-js@2.49.4';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

const SITE = 'https://inoderecords.com';
const QR = `${SITE}/pay/gcash.png`;
const HOLD_MS = 48 * 3600 * 1000;

type Row = { artist: string; album: string; detail: string; price: string };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return reply({ ok: false, why: 'bad method' }, 405);

  let input: {
    items?: { record?: string; n?: number }[];
    buyer?: string;
    ino?: string;
    lines?: string[];
    rows?: { artist?: string; album?: string; detail?: string; price?: string }[];
    total?: string;
    name?: string;
    phone?: string;
    address?: string;
  };
  try {
    input = await req.json();
  } catch {
    return reply({ ok: false, why: 'bad cart' }, 400);
  }

  const items = (input.items ?? []).map((i) => ({
    record: String(i.record ?? ''),
    n: Number(i.n ?? 0),
  }));
  const buyer = String(input.buyer ?? '').trim();
  const ino = String(input.ino ?? '').trim();
  const lines = (input.lines ?? []).map((l) => String(l)).slice(0, 20);
  const total = String(input.total ?? '');
  const name = String(input.name ?? '').trim();
  const phone = String(input.phone ?? '').trim();
  const address = String(input.address ?? '').trim();
  const given: Row[] = (Array.isArray(input.rows) ? input.rows : []).slice(0, 20).map((r) => ({
    artist: String(r?.artist ?? '').slice(0, 200),
    album: String(r?.album ?? '').slice(0, 200),
    detail: String(r?.detail ?? '').slice(0, 200),
    price: String(r?.price ?? '').slice(0, 40),
  }));

  if (
    !items.length || items.length > 20 ||
    items.some((i) => !/^[a-z0-9-]{1,40}$/.test(i.record) || !(i.n >= 1 && i.n <= 10)) ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyer) || buyer.length > 254 ||
    !/^ino 0x[0-9A-F]{1,12}$/.test(ino) ||
    lines.some((l) => l.length > 300) || total.length > 40 ||
    !name || name.length > 120 || !address || address.length > 500 ||
    (phone !== '' && !/^[0-9+().\s-]{7,20}$/.test(phone))
  ) {
    return reply({ ok: false, why: 'bad cart' }, 400);
  }

  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const { data, error } = await db.rpc('shop_claim', { items, buyer, ino });
  if (error) return reply({ ok: false, why: 'shelf error' }, 500);
  if (data && data.ok === false) return reply(data);

  const until = new Date(Date.now() + HOLD_MS);
  const when = until.toLocaleString('en-US', {
    timeZone: 'Asia/Manila',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  const rows: Row[] = given.length
    ? given
    : (lines.length ? lines : items.map((i) => `${i.record} x${i.n}`))
      .map((l) => ({ artist: l, album: '', detail: '', price: '' }));
  const what = rows.map((r) => [r.artist, r.album, r.detail, r.price].filter(Boolean).join(' · ')).join('\n');
  const shipTo = [name, phone, address].filter(Boolean).join('\n');

  const buyerText = `Order placed. Order number: ${ino}

${what}

Pay exactly ${total}.
Reserved for you until ${when}, Philippine time. Unpaid orders go back on sale after that.

01  Scan the QR with GCash, Maya or any bank app and pay exactly ${total}. The QR is attached to this email.
02  Screenshot the receipt.
03  Reply to this email with the screenshot. We confirm, then we ship.

${total} covers the records. Shipping is extra: Lalamove or LBC, paid by you, unless you asked for a Quezon City meetup.

Ship to
${shipTo}

INODERECORDS · Quezon City
${SITE}`;

  const shopText = `${ino}
${what}
Total ${total}
Reserved until ${when}

Buyer: ${name} <${buyer}>${phone ? `\nMobile: ${phone}` : ''}
Ship to: ${address}

Confirm the claim in the Supabase dashboard once the payment lands.`;

  const esc = (s: string) =>
    s.replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
  const br = (s: string) => esc(s).replace(/\n/g, '<br>');
  const INK = '#0a0a0a';
  const PAPER = '#f4f3ef';
  const BLUE = '#2400ff';
  const DIMC = '#8b8a82';
  const HAIR = '#2c2c2a';
  const MONO = "'Courier New',Courier,monospace";
  const label = (t: string, top = 22) =>
    `<tr><td style="padding:${top}px 2px 6px;color:${DIMC};font-family:${MONO};font-size:10px;font-weight:bold;letter-spacing:2px;">${t}</td></tr>`;
  const text = (html: string, size = 13, color = PAPER, bottom = 4) =>
    `<tr><td style="padding:0 2px ${bottom}px;color:${color};font-family:${MONO};font-size:${size}px;line-height:1.6;">${html}</td></tr>`;
  const itemTable = (rs: Row[]) =>
    `<tr><td style="padding:6px 0 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">` +
    rs.map((r) =>
      `<tr><td valign="top" style="border-top:1px solid ${HAIR};padding:11px 2px;font-family:${MONO};">` +
      `<div style="color:${PAPER};font-size:13px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;">${esc(r.artist)}</div>` +
      (r.album ? `<div style="color:${PAPER};font-size:13px;padding-top:2px;">${esc(r.album)}</div>` : '') +
      (r.detail ? `<div style="color:${DIMC};font-size:11px;padding-top:3px;">${esc(r.detail)}</div>` : '') +
      `</td><td valign="top" align="right" style="border-top:1px solid ${HAIR};padding:11px 2px;font-family:${MONO};color:${PAPER};font-size:13px;font-weight:bold;white-space:nowrap;">${esc(r.price)}</td></tr>`
    ).join('') +
    `</table></td></tr>`;
  const step = (n: string, body: string) =>
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 12px;"><tr>` +
    `<td bgcolor="${BLUE}" width="30" style="background:${BLUE};color:${PAPER};font-family:${MONO};font-size:11px;font-weight:bold;text-align:center;padding:5px 0;" valign="top">${n}</td>` +
    `<td style="padding:2px 0 0 12px;color:${PAPER};font-family:${MONO};font-size:13px;line-height:1.6;">${body}</td>` +
    `</tr></table>`;
  const skin = (preheader: string, band: string, inner: string) =>
    `<!doctype html><html><body style="margin:0;padding:0;background:${INK};" bgcolor="${INK}">` +
    `<div style="display:none;max-height:0;overflow:hidden;">${esc(preheader)}</div>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${INK}" style="background:${INK};"><tr><td align="center" style="padding:30px 14px 40px;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;">` +
    `<tr><td style="padding:0 0 16px;color:${PAPER};font-family:${MONO};font-size:14px;font-weight:bold;letter-spacing:3px;">IN&#9673;DERECORDS</td></tr>` +
    `<tr><td bgcolor="${PAPER}" style="background:${PAPER};color:${INK};padding:10px 14px;font-family:${MONO};font-size:11px;font-weight:bold;letter-spacing:3px;">${band}</td></tr>` +
    inner +
    `<tr><td style="padding:30px 0 0;color:${DIMC};font-family:${MONO};font-size:10px;letter-spacing:2px;">INODERECORDS &#183; QUEZON CITY &#183; <a href="${SITE}" style="color:${DIMC};">INODERECORDS.COM</a></td></tr>` +
    `</table></td></tr></table></body></html>`;

  const buyerHtml = skin(
    `Pay exactly ${total} by ${when}. The QR and steps are inside.`,
    'ORDER PLACED',
    label('ORDER NUMBER', 20) +
    text(esc(ino), 16, PAPER, 0) +
    itemTable(rows) +
    label('PAY EXACTLY', 18) +
    `<tr><td style="padding:0 2px 8px;color:${PAPER};font-family:${MONO};font-size:34px;font-weight:bold;">${esc(total)}</td></tr>` +
    text(`Reserved for you until <b>${esc(when)}</b>, Philippine time. Unpaid orders go back on sale after that.`, 13, PAPER, 18) +
    `<tr><td style="padding:0 0 10px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr>` +
    `<td bgcolor="#ffffff" style="background:#ffffff;padding:14px;"><img src="${QR}" width="200" height="200" alt="InstaPay QR for INODERECORDS" style="display:block;width:200px;height:200px;border:0;"></td>` +
    `</tr></table></td></tr>` +
    text('InstaPay QR &#183; works with GCash, Maya and bank apps.<br>On your phone? The QR is attached too. Save it, then upload it in your app&#8217;s QR scanner.', 11, DIMC, 22) +
    `<tr><td style="padding:0;">` +
    step('01', `Scan the QR and pay exactly <b>${esc(total)}</b>.`) +
    step('02', 'Screenshot the receipt.') +
    step('03', 'Reply to this email with the screenshot. We confirm, then we ship.') +
    `</td></tr>` +
    text(`${esc(total)} covers the records. Shipping is extra: Lalamove or LBC, paid by you, unless you asked for a Quezon City meetup.`, 12, DIMC, 0) +
    label('SHIP TO', 24) +
    text(br(shipTo), 13, PAPER, 0)
  );

  const shopHtml = skin(
    `${name} ordered. ${total}.`,
    `ORDER &#183; ${esc(total)}`,
    label('ORDER NUMBER', 20) +
    text(esc(ino), 16, PAPER, 0) +
    itemTable(rows) +
    `<tr><td style="border-top:1px solid ${PAPER};padding:12px 2px 4px;color:${PAPER};font-family:${MONO};font-size:15px;font-weight:bold;">TOTAL ${esc(total)}</td></tr>` +
    text(`Reserved until ${esc(when)}. Unpaid, it goes back on sale after that.`, 12, DIMC, 0) +
    label('BUYER', 24) +
    text(`${esc(name)} &lt;${esc(buyer)}&gt;${phone ? `<br>${esc(phone)}` : ''}`, 13, PAPER, 0) +
    label('SHIP TO', 18) +
    text(br(address), 13, PAPER, 18) +
    text('Confirm the claim in the Supabase dashboard once the payment lands.', 12, DIMC, 0)
  );

  const user = Deno.env.get('SMTP_USER') ?? '';
  const key = Deno.env.get('RESEND_KEY') ?? '';
  let mailed = false;
  try {
    const post = (msg: Record<string, unknown>) =>
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(msg),
        signal: AbortSignal.timeout(15000),
      });
    const send = async (msg: Record<string, unknown>) => {
      let r = await post(msg);
      if (!r.ok && msg.attachments) {
        const { attachments: _drop, ...bare } = msg;
        r = await post(bare);
      }
      if (!r.ok) throw new Error(`resend ${r.status}`);
    };
    await send({
      from: `INODERECORDS <${user}>`,
      to: [buyer],
      subject: `Pay ${total} to complete your order · ${ino}`,
      text: buyerText,
      html: buyerHtml,
      attachments: [{ filename: 'inoderecords-qr.png', path: QR }],
    });
    await send({
      from: `INODERECORDS <${user}>`,
      to: [user],
      reply_to: buyer,
      subject: `Order · ${total} · ${ino}`,
      text: shopText,
      html: shopHtml,
    });
    mailed = true;
  } catch (_e) {
    mailed = false;
  }

  return reply({ ok: true, mailed, until: until.toISOString() });
});
