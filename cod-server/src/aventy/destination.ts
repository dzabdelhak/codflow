import type pg from "pg";
import type { OrderDestination } from "@/platform/outbound/destination";
import { AventyUnauthorizedError, type AventyClient } from "./client";
import { loadChannelKey, markChannelKeyRevoked } from "./keys";
import { redactKey, type AventyKeyVault } from "./key-vault";

export function aventyDestination(deps: { platform: pg.Pool; vault: AventyKeyVault; client: AventyClient }): OrderDestination {
  return {
    name: "aventy",
    async send(entry) {
      const loaded = await loadChannelKey(deps.platform, deps.vault, entry.storeId);
      if (!loaded) return { kind: "unauthorized", reason: "This channel has no Aventy key" };
      if (loaded.status === "revoked") return { kind: "unauthorized", reason: "This channel's Aventy key was revoked" };
      try {
        return await deps.client.sendOrder(loaded.key, { sendId: entry.sendId, payload: entry.payload });
      } catch (err) {
        if (err instanceof AventyUnauthorizedError) {
          await markChannelKeyRevoked(deps.platform, entry.storeId, loaded, redactKey(err.message || "Aventy refused the key", loaded.key));
          return { kind: "unauthorized", reason: "Aventy refused this channel's key" };
        }
        throw new Error(redactKey(err instanceof Error ? err.message : String(err), loaded.key));
      }
    },
  };
}
