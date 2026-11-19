/*
  Prints the shop_shelf upserts for the current stock.json, so the shared
  shelf and the catalog say the same thing. Run it after editing stock.json
  and apply the SQL it prints (dashboard SQL editor, or the management
  API). It never talks to the network itself.

      node shelf.mjs
*/
import { readFile } from 'node:fs/promises';

const stock = JSON.parse(
  await readFile(new URL('./stock.json', import.meta.url), 'utf8'),
);

const bad = stock.records.find((r) => !/^[a-z0-9-]+$/.test(r.id));
if (bad) throw new Error(`record id not sql-safe: ${bad.id}`);

const rows = stock.records.map((r) => `('${r.id}', ${r.qty})`).join(',\n  ');
console.log(`insert into shop_shelf (id, qty) values
  ${rows}
on conflict (id) do update set qty = excluded.qty;`);
