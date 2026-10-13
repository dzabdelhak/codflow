import { eq, sql } from "drizzle-orm";
import { stores } from "../db/schema";
import type { AppDb } from "../db/client";
import { one } from "../db/client";

/**
 * The current store's next order number, e.g. NOUR-00042. The counter row stays locked
 * until the order's transaction ends, so two orders never share a number.
 */
export async function allocateOrderNumber(db: AppDb): Promise<string> {
  const row = await db
    .update(stores)
    .set({ orderSeq: sql`${stores.orderSeq} + 1` })
    .where(eq(stores.id, sql`current_setting('app.store_id')`))
    .returning({ prefix: stores.orderPrefix, seq: stores.orderSeq })
    .then(one);
  return `${row.prefix}-${String(row.seq).padStart(5, "0")}`;
}

/** An order-number prefix from a subdomain: its letters and digits, upper case, at most 8. */
export function orderPrefixFor(subdomain: string): string {
  return subdomain.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8).toUpperCase() || "CMD";
}
