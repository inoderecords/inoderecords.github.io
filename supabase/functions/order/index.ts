/*
  The order, done properly: one call claims the records on the shared
  shelf and sends both emails from the shop's own address, through
  Spacemail's SMTP. The buyer's confirmation really is from
  orders@inoderecords.com, so replying to it reaches the shop, and the
  domain's SPF and DKIM vouch for it, which is what keeps it out of spam.

  The page calls this instead of posting to FormSubmit; FormSubmit stays
  as the no-script fallback only. If the claim fails the caller is told
  which record fell through and nothing is sent. If the claim lands but
  the mail cannot leave (SMTP down, port blocked), the claim stands and
  the caller is told mailed: false, so it can fall back to FormSubmit for
  the emails alone.

  Secrets, set with `supabase secrets set`:
    SMTP_HOST   smtp.spacemail.com
    SMTP_PORT   465
    SMTP_USER   the shop address
    SMTP_PASS   its mailbox password
*/
import { createClient } from 'npm:@supabase/supabase-js@2.49.4';
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

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

  /* ── the claim, atomic, before anything is said to anyone ──────────── */

  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const { data, error } = await db.rpc('shop_claim', { items, buyer, ino });
  if (error) return reply({ ok: false, why: 'shelf error' }, 500);
  if (data && data.ok === false) return reply(data);

  /* ── the two emails, from the shop's own hand ──────────────────────── */

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

  const user = Deno.env.get('SMTP_USER') ?? '';
  const port = Number(Deno.env.get('SMTP_PORT') ?? '465');
  let mailed = false;
  try {
    const smtp = new SMTPClient({
      connection: {
        hostname: Deno.env.get('SMTP_HOST') ?? 'smtp.spacemail.com',
        port,
        tls: port === 465, /* 465 is implicit TLS; 587 negotiates STARTTLS */
        auth: { username: user, password: Deno.env.get('SMTP_PASS') ?? '' },
      },
    });
    /* a blocked port hangs the full TCP timeout; never make a buyer wait
       through that. Past the deadline the claim stands and we say
       mailed: false, and the page sends the emails the old way. */
    const deadline = new Promise<never>((_, no) =>
      setTimeout(() => no(new Error('mail deadline')), 15000));
    await Promise.race([deadline, (async () => {
      await smtp.send({
        from: `INODERECORDS <${user}>`,
        to: buyer,
        subject: `Order placed · ${ino} · INODERECORDS`,
        content: buyerText,
      });
      await smtp.send({
        from: `INODERECORDS <${user}>`,
        to: user,
        replyTo: buyer,
        subject: `Order · ${total} · ${ino}`,
        content: shopText,
      });
      await smtp.close();
    })()]);
    mailed = true;
  } catch (_e) {
    /* the claim stands; the caller sends the emails the old way */
  }

  return reply({ ok: true, mailed });
});
