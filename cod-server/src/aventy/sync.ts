import type pg from "pg";
import { sql } from "drizzle-orm";
import { withStore } from "@/db/scope";
import type { AppDb } from "../../../cod-shared/db/client";
import { aventySyncState, AVENTY_DOMAINS, type AventyDomain } from "../../../cod-shared/db/schema";
import { AventyPermissionError, AventyUnauthorizedError, type AventyClient } from "./client";
import { applyCatalogueChanges, applyCatalogueSnapshot, applyDeliveryGrid } from "./apply";
import { loadChannelKey, markChannelKeyRevoked } from "./keys";
import { redactKey, type AventyKeyVault } from "./key-vault";

export interface AventyDeps {
  app: pg.Pool;
  platform: pg.Pool;
  vault: AventyKeyVault;
  client: AventyClient;
}

export type DomainOutcome = { domain: AventyDomain; result: "synced" | "unchanged" | "not_permitted" | "failed"; detail?: string };
export type ChannelSyncResult =
  | { storeId: string; state: "no_key" | "revoked" }
  | { storeId: string; state: "synced"; domains: DomainOutcome[] };

async function recordDomain(db: AppDb, domain: AventyDomain, values: { cursor?: string; error: string | null }) {
  const set = {
    ...(values.cursor !== undefined ? { cursor: values.cursor, syncedAt: sql`now()` } : {}),
    lastError: values.error,
    updatedAt: sql`now()`,
  };
  await db.insert(aventySyncState).values({ domain, ...set }).onConflictDoUpdate({ target: [aventySyncState.storeId, aventySyncState.domain], set });
}

async function pullDomain(deps: AventyDeps, channel: { storeId: string; merchantId: string }, key: string, domain: AventyDomain, cursor: string | null) {
  const inChannel = <T>(fn: (db: AppDb) => Promise<T>) => withStore(deps.app, channel.storeId, fn, channel.merchantId);
  if (domain === "delivery") {
    const { cursor: next, grid } = await deps.client.deliveryGrid(key);
    await inChannel(async (db) => {
      await applyDeliveryGrid(db, channel.storeId, grid);
      await recordDomain(db, domain, { cursor: next, error: null });
    });
    return;
  }
  const changes = cursor ? await deps.client.catalogueChanges(key, cursor) : "cursor_expired";
  if (changes === "cursor_expired") {
    const snapshot = await deps.client.catalogueSnapshot(key);
    await inChannel(async (db) => {
      await applyCatalogueSnapshot(db, snapshot.products);
      await recordDomain(db, domain, { cursor: snapshot.cursor, error: null });
    });
    return;
  }
  await inChannel(async (db) => {
    await applyCatalogueChanges(db, changes.products, changes.removed);
    await recordDomain(db, domain, { cursor: changes.cursor, error: null });
  });
}

export async function syncChannel(deps: AventyDeps, channel: { storeId: string; merchantId: string }): Promise<ChannelSyncResult> {
  const loaded = await loadChannelKey(deps.platform, deps.vault, channel.storeId);
  if (!loaded) return { storeId: channel.storeId, state: "no_key" };
  if (loaded.status === "revoked") return { storeId: channel.storeId, state: "revoked" };
  const { key } = loaded;

  const revoked = async (err: AventyUnauthorizedError): Promise<ChannelSyncResult> => {
    await markChannelKeyRevoked(deps.platform, channel.storeId, redactKey(err.message || "Aventy refused the key", key));
    return { storeId: channel.storeId, state: "revoked" };
  };

  let changed: AventyDomain[];
  try {
    ({ changed } = await deps.client.heartbeat(key));
  } catch (err) {
    if (err instanceof AventyUnauthorizedError) return revoked(err);
    throw new Error(redactKey(err instanceof Error ? err.message : String(err), key));
  }

  const { rows } = await deps.platform.query<{ domain: AventyDomain; cursor: string | null }>(
    "select domain, cursor from aventy_sync_state where store_id = $1",
    [channel.storeId],
  );
  const cursors = new Map(rows.map((r) => [r.domain, r.cursor]));
  const domains: DomainOutcome[] = [];
  for (const domain of AVENTY_DOMAINS) {
    const cursor = cursors.get(domain) ?? null;
    if (cursor && !changed.includes(domain)) {
      domains.push({ domain, result: "unchanged" });
      continue;
    }
    try {
      await pullDomain(deps, channel, key, domain, cursor);
      domains.push({ domain, result: "synced" });
    } catch (err) {
      if (err instanceof AventyUnauthorizedError) return revoked(err);
      const detail = err instanceof AventyPermissionError
        ? "The channel's Aventy key does not grant this domain"
        : redactKey(err instanceof Error ? err.message : String(err), key).slice(0, 500);
      await withStore(deps.app, channel.storeId, (db) => recordDomain(db, domain, { error: detail }), channel.merchantId);
      domains.push({ domain, result: err instanceof AventyPermissionError ? "not_permitted" : "failed", detail });
    }
  }
  return { storeId: channel.storeId, state: "synced", domains };
}

export async function runAventyHeartbeat(deps: AventyDeps, { concurrency = 4 }: { concurrency?: number } = {}): Promise<ChannelSyncResult[]> {
  const { rows: channels } = await deps.platform.query<{ storeId: string; merchantId: string }>(
    `select k.store_id as "storeId", s.merchant_id as "merchantId"
       from channel_aventy_keys k join stores s on s.id = k.store_id
      where k.status = 'active' and s.status <> 'archived'
      order by k.store_id`,
  );
  const results: ChannelSyncResult[] = [];
  for (let i = 0; i < channels.length; i += concurrency) {
    results.push(...await Promise.all(channels.slice(i, i + concurrency).map(async (channel) => {
      try {
        return await syncChannel(deps, channel);
      } catch (err) {
        console.error(JSON.stringify({ event: "aventy.sync_failed", storeId: channel.storeId, error: err instanceof Error ? err.message : String(err) }));
        return { storeId: channel.storeId, state: "synced" as const, domains: [] };
      }
    })));
  }
  return results;
}
