/**
 * May this merchant have another store? One seam: today the merchant's own
 * store limit, later Aventy's plan (ticket 15) behind the same interface.
 *
 * `decide` runs inside the creation transaction, after the merchant row is
 * locked, so two simultaneous creations cannot both take the last slot.
 */
import type pg from "pg";

export type PlanDecision =
  | { allowed: true }
  | { allowed: false; limit: number; used: number };

export interface PlanPolicy {
  canCreateStore(client: pg.PoolClient, merchantId: string): Promise<PlanDecision>;
}

export function localPlanPolicy(): PlanPolicy {
  return {
    async canCreateStore(client, merchantId) {
      const { rows } = await client.query<{ store_limit: number | null; used: number }>(
        `select m.store_limit, (select count(*)::int from stores s where s.merchant_id = m.id) as used
           from merchants m where m.id = $1`,
        [merchantId],
      );
      const row = rows[0];
      if (!row || row.store_limit === null || row.used < row.store_limit) return { allowed: true };
      return { allowed: false, limit: row.store_limit, used: row.used };
    },
  };
}
