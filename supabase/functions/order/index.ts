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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return reply({ ok: false, why: 'bad method' }, 405);

  let input: {
    items?: { record?: string; n?: number }[];
    buyer?: string;
    ino?: string;
    lines?: string[];
    total?: string;
    name?: string;
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
  const address = String(input.address ?? '').trim();

  if (
    !items.length || items.length > 20 ||
    items.some((i) => !/^[a-z0-9-]{1,40}$/.test(i.record) || !(i.n >= 1 && i.n <= 10)) ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyer) || buyer.length > 254 ||
    !/^ino 0x[0-9A-F]{1,12}$/.test(ino) ||
    lines.some((l) => l.length > 300) || total.length > 40 ||
    !name || name.length > 120 || !address || address.length > 500
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

  const what = lines.length ? lines.join('\n') : items.map((i) => `${i.record} x${i.n}`).join('\n');
  const buyerText = `This confirms your order.

${ino}
${what}
Total ${total}

Ship to
${name}
${address}

An order is a claim and the first confirmed payment gets the record.

01  Pay the exact amount via GCash. The steps and the QR: ${SITE}/ordered.html
02  Reply to this email with your payment screenshot. That is all; we
    confirm and ship. Shipping is Lalamove or LBC, shouldered by the
    buyer, unless you asked for a Quezon City meetup.

INODERECORDS - Quezon City
${SITE}`;

  const shopText = `${ino}
${what}
Total ${total}

Buyer: ${name} <${buyer}>
Ship to: ${address}

Confirm the claim in the Supabase dashboard once the payment lands.`;

  const esc = (s: string) =>
    s.replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
  const INK = '#0a0a0a';
  const PAPER = '#f4f3ef';
  const BLUE = '#2400ff';
  const DIMC = '#8b8a82';
  const HAIR = '#2c2c2a';
  const MONO = "'Courier New',Courier,monospace";
  const rowsOf = (ls: string[]) =>
    ls.map((l) =>
      `<tr><td style="border-top:1px solid ${HAIR};padding:9px 2px;color:${PAPER};font-family:${MONO};font-size:13px;">${esc(l)}</td></tr>`
    ).join('');
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
    `<tr><td style="padding:28px 0 0;color:${DIMC};font-family:${MONO};font-size:10px;letter-spacing:2px;">INODERECORDS &#183; QUEZON CITY &#183; <a href="${SITE}" style="color:${DIMC};">INODERECORDS.COM</a></td></tr>` +
    `</table></td></tr></table></body></html>`;
  const buyerHtml = skin(
    `Pay exactly ${total}, then reply with your GCash screenshot.`,
    'ORDER PLACED',
    `<tr><td style="padding:18px 2px 2px;color:${PAPER};font-family:${MONO};font-size:20px;font-weight:bold;letter-spacing:1px;">${esc(ino)}</td></tr>` +
    `<tr><td style="padding:0 2px 16px;color:${DIMC};font-family:${MONO};font-size:10px;letter-spacing:2px;">AN ORDER IS A CLAIM &#183; FIRST CONFIRMED PAYMENT GETS THE RECORD</td></tr>` +
    rowsOf(lines.length ? lines : items.map((i) => `${i.record} x${i.n}`)) +
    `<tr><td style="border-top:1px solid ${PAPER};padding:12px 2px 2px;color:${DIMC};font-family:${MONO};font-size:10px;font-weight:bold;letter-spacing:2px;">PAY EXACTLY</td></tr>` +
    `<tr><td style="padding:0 2px 18px;color:${PAPER};font-family:${MONO};font-size:34px;font-weight:bold;">${esc(total)}</td></tr>` +
    `<tr><td style="padding:0 0 18px;">` +
    step('01', `Pay the exact amount via GCash. The QR is on your order page: <a href="${SITE}/ordered.html" style="color:${PAPER};">inoderecords.com/ordered.html</a>`) +
    step('02', `Reply to this email with your payment screenshot. That is all; we confirm and ship. Shipping is Lalamove or LBC, shouldered by the buyer, unless you asked for a Quezon City meetup.`) +
    `</td></tr>` +
    `<tr><td style="border-top:1px solid ${HAIR};padding:12px 2px 2px;color:${DIMC};font-family:${MONO};font-size:10px;font-weight:bold;letter-spacing:2px;">SHIP TO</td></tr>` +
    `<tr><td style="padding:0 2px 6px;color:${PAPER};font-family:${MONO};font-size:13px;line-height:1.6;">${esc(name)}<br>${esc(address).replace(/\n/g, '<br>')}</td></tr>`
  );
  const shopHtml = skin(
    `${name} ordered. ${total}.`,
    `ORDER &#183; ${esc(total)}`,
    `<tr><td style="padding:18px 2px 10px;color:${PAPER};font-family:${MONO};font-size:20px;font-weight:bold;letter-spacing:1px;">${esc(ino)}</td></tr>` +
    rowsOf(lines.length ? lines : items.map((i) => `${i.record} x${i.n}`)) +
    `<tr><td style="border-top:1px solid ${PAPER};padding:12px 2px 18px;color:${PAPER};font-family:${MONO};font-size:15px;font-weight:bold;">TOTAL ${esc(total)}</td></tr>` +
    `<tr><td style="border-top:1px solid ${HAIR};padding:12px 2px 2px;color:${DIMC};font-family:${MONO};font-size:10px;font-weight:bold;letter-spacing:2px;">BUYER</td></tr>` +
    `<tr><td style="padding:0 2px 12px;color:${PAPER};font-family:${MONO};font-size:13px;line-height:1.6;">${esc(name)} &lt;${esc(buyer)}&gt;</td></tr>` +
    `<tr><td style="border-top:1px solid ${HAIR};padding:12px 2px 2px;color:${DIMC};font-family:${MONO};font-size:10px;font-weight:bold;letter-spacing:2px;">SHIP TO</td></tr>` +
    `<tr><td style="padding:0 2px 16px;color:${PAPER};font-family:${MONO};font-size:13px;line-height:1.6;">${esc(address).replace(/\n/g, '<br>')}</td></tr>` +
    `<tr><td style="padding:0 2px 6px;color:${DIMC};font-family:${MONO};font-size:12px;line-height:1.6;">Confirm the claim in the Supabase dashboard once the payment lands.</td></tr>`
  );

  const user = Deno.env.get('SMTP_USER') ?? '';
  const key = Deno.env.get('RESEND_KEY') ?? '';
  let mailed = false;
  try {
    const send = async (msg: Record<string, unknown>) => {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(msg),
        signal: AbortSignal.timeout(15000),
      });
      if (!r.ok) throw new Error(`resend ${r.status}`);
    };
    await send({
      from: `INODERECORDS <${user}>`,
      to: [buyer],
      subject: `Order placed · ${ino} · INODERECORDS`,
      text: buyerText,
      html: buyerHtml,
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

  return reply({ ok: true, mailed });
});
