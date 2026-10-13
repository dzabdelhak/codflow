/**
 * Connection pools on the platform database (ADR-0003), shared by cod-server
 * and the dashboard.
 *
 *   app      — request code. Runs as `codflow_app`, so Row-Level Security
 *              confines it to the store/merchant set on its transaction.
 *   platform — platform code (identity, routing, schedulers, cross-store
 *              work). Runs as `codflow_platform`, which bypasses RLS.
 */
import pg from "pg";
import { getDb, type AppDb } from "./client";

// D1 returned COUNT/SUM/AVG as numbers; node-postgres returns bigint and
// numeric as strings. Store amounts are DZD, far inside 2^53.
pg.types.setTypeParser(pg.types.builtins.INT8, Number);
pg.types.setTypeParser(pg.types.builtins.NUMERIC, parseFloat);

export type DbRole = "codflow_app" | "codflow_platform";

export interface Database {
  app: pg.Pool;
  platform: pg.Pool;
  close(): Promise<void>;
}

export function createPool(connectionString: string, role: DbRole, max = 10): pg.Pool {
  // The role is a startup parameter, so it is in force before the first query.
  const pool = new pg.Pool({ connectionString, max, options: `-c role=${role}` });
  pool.on("connect", (client) => {
    client.on("error", (err) => console.error(`[db:${role}] connection error:`, err.message));
  });
  pool.on("error", (err) => console.error(`[db:${role}] idle client error:`, err.message));
  return pool;
}

export function createDatabase(connectionString: string): Database {
  const app = createPool(connectionString, "codflow_app", 20);
  const platform = createPool(connectionString, "codflow_platform", 5);
  return { app, platform, close: async () => void (await Promise.all([app.end(), platform.end()])) };
}

/** Run `fn` on one connection, in one transaction, pinned to `storeId` (and its merchant). */
export async function withStore<T>(
  pool: pg.Pool,
  storeId: string | null,
  fn: (db: AppDb) => Promise<T>,
  merchantId?: string | null,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    if (merchantId) await client.query("select set_config('app.merchant_id', $1, true)", [merchantId]);
    if (storeId) await client.query("select set_config('app.store_id', $1, true)", [storeId]);
    const result = await fn(getDb(client, { inTransaction: true }));
    await client.query("commit");
    return result;
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
