import { eq, sql } from "drizzle-orm";
import { stores } from "../db/schema";
import type { AppDb } from "../db/client";
import { one } from "../db/client";

export async function allocateOrderNumber(db: AppDb): Promise<string> {
  const row = await db
    .update(stores)
    .set({ orderSeq: sql`${stores.orderSeq} + 1` })
    .where(eq(stores.id, sql`current_setting('app.store_id')`))
    .returning({ prefix: stores.orderPrefix, seq: stores.orderSeq })
    .then(one);
  return `${row.prefix}-${String(row.seq).padStart(5, "0")}`;
}

export function orderPrefixFor(subdomain: string, taken: Iterable<string> = []): string {
  const base = subdomain.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8).toUpperCase() || "CMD";
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) {
    const prefix = base.slice(0, 8 - String(n).length) + n;
    if (!used.has(prefix)) return prefix;
  }
}
