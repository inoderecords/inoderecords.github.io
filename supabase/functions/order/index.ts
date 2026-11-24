import { createClient } from 'npm:@supabase/supabase-js@2.49.4';
import { buyerMail, shopMail, type Order, type Row } from './mail.ts';

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
const PAGE = 'https://www.facebook.com/inoderecords';
const QR = `${SITE}/pay/gcash.png`;
const HOLD_MS = 24 * 3600 * 1000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return reply({ ok: false, why: 'bad method' }, 405);

  let input: {
    items?: { record?: string; n?: number }[];
    buyer?: string;
    ino?: string;
    lines?: string[];
    rows?: { artist?: string; album?: string; detail?: string; price?: string; art?: string }[];
    total?: string;
    name?: string;
    phone?: string;
    address?: string;
    delivery?: { id?: string; label?: string; fee?: number | null; next?: string } | null;
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
    art: String(r?.art ?? '').slice(0, 120),
  }));
  const dIn = input.delivery && typeof input.delivery === 'object' ? input.delivery : null;
  const delivery = dIn
    ? {
      id: String(dIn.id ?? ''),
      label: String(dIn.label ?? '').slice(0, 80),
      fee: typeof dIn.fee === 'number' && Number.isFinite(dIn.fee) && dIn.fee >= 0 ? Math.round(dIn.fee) : null,
      next: String(dIn.next ?? '').slice(0, 300),
    }
    : null;

  if (
    (delivery && (!/^[a-z0-9-]{1,20}$/.test(delivery.id) || !delivery.label || delivery.fee === null)) ||
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
      .map((l) => ({ artist: l, album: '', detail: '', price: '', art: '' }));
  const order: Order = {
    site: SITE,
    page: PAGE,
    ino,
    total,
    when,
    rows,
    delivery: delivery ? { label: delivery.label, fee: delivery.fee, next: delivery.next } : null,
    name,
    phone,
    address,
    buyer,
  };
  const toBuyer = buyerMail(order);
  const toShop = shopMail(order);

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
      text: toBuyer.text,
      html: toBuyer.html,
      attachments: [{ filename: 'inoderecords-qr.png', path: QR }],
    });
    await send({
      from: `INODERECORDS <${user}>`,
      to: [user],
      reply_to: buyer,
      subject: `Order · ${total} · ${ino}`,
      text: toShop.text,
      html: toShop.html,
    });
    mailed = true;
  } catch (_e) {
    mailed = false;
  }

  return reply({ ok: true, mailed, until: until.toISOString() });
});
