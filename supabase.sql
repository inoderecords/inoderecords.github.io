-- The shelf, as shared truth: what makes a double-sell impossible.
--
-- stock.json stays the catalog (titles, prices, copy). These two tables
-- hold only the claim state: how many copies exist, and who has claimed
-- one. The page asks shop_availability before it sells and shop_claim
-- when someone orders; the function is atomic, so of two buyers racing
-- for the last copy exactly one gets it and the other is refused before
-- any email exists.
--
-- A pending claim expires after 48 hours unless the owner confirms it in
-- the dashboard (payment arrived) or releases it (it did not). Expiry is
-- just arithmetic in the view: nothing needs a cron.
--
-- Apply with the management API or the dashboard SQL editor. Idempotent.

create table if not exists shop_shelf (
  id  text primary key,
  qty int  not null check (qty >= 0)
);

create table if not exists shop_claims (
  id         bigint generated always as identity primary key,
  record     text not null references shop_shelf (id),
  ino        text not null,
  email      text not null,
  status     text not null default 'pending'
             check (status in ('pending', 'confirmed', 'released')),
  created_at timestamptz not null default now()
);

-- What the page may know: a number per record, never a claimant.
create or replace view shop_availability
with (security_invoker = off) as
  select s.id  as record,
         s.qty - count(c.id) filter (
           where c.status = 'confirmed'
              or (c.status = 'pending'
                  and c.created_at > now() - interval '48 hours')
         ) as free
  from shop_shelf s
  left join shop_claims c on c.record = s.id
  group by s.id, s.qty;

-- One atomic claim for a whole cart. items: [{"record":"phoebe","n":1}].
-- All or nothing: a cart with one claimed record claims none of it, and
-- says which record fell through so the page can name it.
create or replace function shop_claim(items jsonb, buyer text, ino text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  it    record;
  avail int;
begin
  if jsonb_array_length(items) < 1 or jsonb_array_length(items) > 20 then
    return jsonb_build_object('ok', false, 'why', 'bad cart');
  end if;
  if buyer is null or buyer = '' or length(buyer) > 254
     or ino is null or length(ino) > 40 then
    return jsonb_build_object('ok', false, 'why', 'bad cart');
  end if;

  -- locks taken in record order, so two carts can never deadlock
  for it in
    select * from jsonb_to_recordset(items) as x(record text, n int)
    order by record
  loop
    if it.n is null or it.n < 1 or it.n > 10 then
      return jsonb_build_object('ok', false, 'why', 'bad cart');
    end if;
    perform pg_advisory_xact_lock(hashtext('shop:' || it.record));
    select a.free into avail from shop_availability a where a.record = it.record;
    if avail is null then
      return jsonb_build_object('ok', false, 'why', 'unknown', 'record', it.record);
    end if;
    if avail < it.n then
      return jsonb_build_object('ok', false, 'why', 'claimed', 'record', it.record);
    end if;
  end loop;

  for it in
    select * from jsonb_to_recordset(items) as x(record text, n int)
    order by record
  loop
    insert into shop_claims (record, ino, email)
      select it.record, ino, buyer from generate_series(1, it.n);
  end loop;

  return jsonb_build_object('ok', true);
end
$$;

-- The public key may see the count and call the function. Nothing else.
alter table shop_shelf  enable row level security;
alter table shop_claims enable row level security;
revoke all on shop_shelf  from anon, authenticated;
revoke all on shop_claims from anon, authenticated;
grant  select on shop_availability to anon;
revoke all on function shop_claim(jsonb, text, text) from public;
grant  execute on function shop_claim(jsonb, text, text) to anon;
