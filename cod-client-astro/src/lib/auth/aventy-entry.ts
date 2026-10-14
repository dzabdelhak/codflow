import { randomBytes } from "node:crypto";
import type pg from "pg";
import type { BetterAuthPlugin } from "better-auth";
import { createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { aventyMerchantId, verifyLinkToken, type AventyLinkClaims } from "../../../../cod-shared/aventy/link-token";

export type ProvisionResult = { ok: true; userId: string } | { ok: false; reason: "email_taken" | "inactive" };

export async function provisionAventyMerchant(platform: pg.Pool, claims: AventyLinkClaims): Promise<ProvisionResult> {
  const merchantId = aventyMerchantId(claims.ref);
  const client = await platform.connect();
  try {
    await client.query("begin");
    await client.query("insert into merchants (id, name, created_at) values ($1, $2, $3) on conflict (id) do nothing", [
      merchantId,
      claims.shop,
      new Date().toISOString(),
    ]);
    const { rows: [existing] } = await client.query<{ id: string; merchant_id: string; status: string }>(
      "select id, merchant_id, status from users where email = $1 for update",
      [claims.email],
    );
    if (existing && existing.merchant_id !== merchantId) {
      await client.query("rollback");
      return { ok: false, reason: "email_taken" };
    }
    if (existing?.status === "inactive") {
      await client.query("rollback");
      return { ok: false, reason: "inactive" };
    }
    const userId = existing?.id ?? randomBytes(16).toString("hex");
    if (!existing) {
      await client.query(
        `insert into users (id, name, email, email_verified, role, status, merchant_id, created_at, updated_at)
         values ($1, $2, $3, true, 'admin', 'active', $4, now(), now())`,
        [userId, claims.name, claims.email, merchantId],
      );
    }
    await client.query("commit");
    return { ok: true, userId };
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export interface AventyEntryOptions {
  secret: () => string | undefined;
  platform: () => pg.Pool;
  claimOnce: (jti: string, ttlSeconds: number) => Promise<boolean>;
}

export function aventyEntry(options: AventyEntryOptions) {
  return {
    id: "aventy-entry",
    endpoints: {
      aventyEnter: createAuthEndpoint("/aventy/enter", { method: "GET" }, async (ctx) => {
        const refuse = (reason: string) => ctx.redirect(`/sign-in?aventy=${reason}`);
        const secret = options.secret();
        const token = ctx.request ? new URL(ctx.request.url).searchParams.get("token") : null;
        if (!secret) throw refuse("not_configured");
        if (!token) throw refuse("invalid");
        const verified = verifyLinkToken(secret, token);
        if (!verified.ok) throw refuse(verified.reason === "expired" ? "expired" : "invalid");
        const { claims } = verified;
        const ttl = Math.max(1, claims.exp - Math.floor(Date.now() / 1000)) + 60;
        if (!(await options.claimOnce(claims.jti, ttl))) throw refuse("used");

        const provisioned = await provisionAventyMerchant(options.platform(), claims);
        if (!provisioned.ok) throw refuse(provisioned.reason);
        const user = await ctx.context.internalAdapter.findUserById(provisioned.userId);
        if (!user) throw refuse("invalid");
        const session = await ctx.context.internalAdapter.createSession(user.id);
        await setSessionCookie(ctx, { session, user });
        throw ctx.redirect(`/stores/new?from=aventy&shop=${encodeURIComponent(claims.shop)}`);
      }),
    },
  } satisfies BetterAuthPlugin;
}
