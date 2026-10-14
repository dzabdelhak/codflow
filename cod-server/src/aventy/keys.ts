import { eq, sql } from "drizzle-orm";
import type pg from "pg";
import type { AppDb } from "../../../cod-shared/db/client";
import { first } from "../../../cod-shared/db/client";
import { channelAventyKeys, outboundOrders } from "../../../cod-shared/db/schema";
import type { AventyKeyVault } from "./key-vault";

export interface ChannelKeyStatus {
  configured: boolean;
  hint: string | null;
  status: "active" | "revoked" | null;
  statusDetail: string | null;
  statusChangedAt: string | null;
}

export async function channelKeyStatus(db: AppDb): Promise<ChannelKeyStatus> {
  const row = await db
    .select({ hint: channelAventyKeys.keyHint, status: channelAventyKeys.status, detail: channelAventyKeys.statusDetail, changedAt: channelAventyKeys.statusChangedAt })
    .from(channelAventyKeys)
    .then(first);
  return row
    ? { configured: true, hint: `••••${row.hint}`, status: row.status, statusDetail: row.detail, statusChangedAt: row.changedAt.toISOString() }
    : { configured: false, hint: null, status: null, statusDetail: null, statusChangedAt: null };
}

export async function saveChannelKey(db: AppDb, vault: AventyKeyVault, storeId: string, key: string): Promise<void> {
  const sealed = vault.seal(storeId, key);
  const values = {
    keyCiphertext: sealed.ciphertext,
    keyHint: sealed.hint,
    encryptionKeyId: sealed.encryptionKeyId,
    status: "active" as const,
    statusDetail: null,
    statusChangedAt: sql`now()`,
    updatedAt: sql`now()`,
  };
  await db.insert(channelAventyKeys).values(values).onConflictDoUpdate({ target: channelAventyKeys.storeId, set: values });
  await db.update(outboundOrders).set({ nextAttemptAt: sql`now()` }).where(eq(outboundOrders.status, "pending"));
}

export async function removeChannelKey(db: AppDb): Promise<boolean> {
  const removed = await db.delete(channelAventyKeys).returning({ storeId: channelAventyKeys.storeId });
  return removed.length > 0;
}

export interface LoadedChannelKey {
  key: string;
  status: "active" | "revoked";
  ciphertext: string;
}

export async function loadChannelKey(platform: pg.Pool, vault: AventyKeyVault, storeId: string): Promise<LoadedChannelKey | null> {
  const { rows: [row] } = await platform.query<{ ciphertext: string; keyId: string; status: "active" | "revoked" }>(
    `select key_ciphertext as ciphertext, encryption_key_id as "keyId", status from channel_aventy_keys where store_id = $1`,
    [storeId],
  );
  if (!row) return null;
  const key = vault.open(storeId, { ciphertext: row.ciphertext, encryptionKeyId: row.keyId });
  if (row.keyId !== vault.currentKeyId) {
    const sealed = vault.seal(storeId, key);
    const { rowCount } = await platform.query(
      `update channel_aventy_keys set key_ciphertext = $2, encryption_key_id = $3, updated_at = now()
        where store_id = $1 and key_ciphertext = $4`,
      [storeId, sealed.ciphertext, sealed.encryptionKeyId, row.ciphertext],
    );
    if (rowCount) return { key, status: row.status, ciphertext: sealed.ciphertext };
  }
  return { key, status: row.status, ciphertext: row.ciphertext };
}

export async function markChannelKeyRevoked(platform: pg.Pool, storeId: string, refused: LoadedChannelKey, detail: string): Promise<void> {
  const { rowCount } = await platform.query(
    `update channel_aventy_keys set status = 'revoked', status_detail = $2, status_changed_at = now(), updated_at = now()
      where store_id = $1 and status = 'active' and key_ciphertext = $3`,
    [storeId, detail, refused.ciphertext],
  );
  if (rowCount) console.warn(JSON.stringify({ event: "aventy.key_revoked", storeId, detail }));
}
