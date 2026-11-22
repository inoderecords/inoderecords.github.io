import { readFile } from "node:fs/promises";

const stock = JSON.parse(await readFile(new URL("./stock.json", import.meta.url), "utf8"));

const bad = stock.records.find(r => !/^[a-z0-9-]+$/.test(r.id));

if (bad) throw new Error(`record id not sql-safe: ${bad.id}`);

const rows = stock.records.map(r => `('${r.id}', ${r.qty})`).join(",\n  ");

console.log(`insert into shop_shelf (id, qty) values\n  ${rows}\non conflict (id) do update set qty = excluded.qty;`);