import { drizzle } from "drizzle-orm/node-postgres";
import { sql, type SQL } from "drizzle-orm";
import type { ClientBase, Pool } from "pg";
import * as schema from "./schema";

type BatchItem = PromiseLike<unknown>;

/** The first row, or undefined: `await query.then(first)`. */
export function first<T>(rows: T[]): T | undefined {
  return rows[0];
}

/** The one row a write's `returning()` must give back; throws when it did not. */
export function one<T>(rows: T[]): T {
  if (rows.length === 0) throw new Error("Expected the write to return a row");
  return rows[0];
}

let savepoints = 0;

/**
 * A database handle bound to ONE connection, so every statement — and every
 * statement of a `batch` — runs on the same session.
 *
 * `inTransaction`: the request scope has already opened a transaction (and set
 * the current store on it); `batch` then nests with a savepoint. Otherwise
 * (tests, scripts) `batch` opens its own transaction.
 *
 * `batch`, `all` and `get` keep the call shapes the queries were written
 * against before PostgreSQL: `batch` runs its statements in order, all-or-nothing;
 * `all`/`get`/`run` run raw SQL (`run` reports `meta.changes`).
 *
 * Platform code may pass a Pool for cross-store reads; `batch` then refuses,
 * because a pool cannot keep the statements on one connection.
 */
export function getDb(client: ClientBase | Pool, opts: { inTransaction?: boolean } = {}) {
  const db = drizzle(client as Pool, { schema });

  async function batch<T extends readonly [BatchItem, ...BatchItem[]]>(
    statements: T,
  ): Promise<{ -readonly [K in keyof T]: Awaited<T[K]> }> {
    if ("totalCount" in client) throw new Error("batch() needs a single connection, not a pool");
    const name = sql.raw(`batch_${++savepoints}`);
    await db.execute(opts.inTransaction ? sql`savepoint ${name}` : sql`begin`);
    try {
      const out: unknown[] = [];
      for (const statement of statements) out.push(await statement);
      await db.execute(opts.inTransaction ? sql`release savepoint ${name}` : sql`commit`);
      return out as never;
    } catch (err) {
      await db.execute(opts.inTransaction ? sql`rollback to savepoint ${name}` : sql`rollback`);
      throw err;
    }
  }

  const all = <T>(query: SQL) => db.execute(query).then((r) => r.rows as T[]);
  const get = <T>(query: SQL) => all<T>(query).then((rows) => rows[0] as T | undefined);
  const run = (query: SQL) =>
    db.execute(query).then((r) => ({ meta: { changes: r.rowCount ?? 0 } }));

  return Object.assign(db, { batch, all, get, run });
}

export type AppDb = ReturnType<typeof getDb>;
