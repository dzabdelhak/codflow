import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { customSession, jwt } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { getDb } from "../../../../cod-shared/db/client";
import { withStore } from "../../../../cod-shared/db/pools";
import { users, sessions, accounts, verifications, jwkss, userScopes } from "../../../../cod-shared/db/schema";
import { getStore } from "../../../../cod-shared/queries/stores";
import { renderPasswordResetEmail } from "../../../../cod-shared/lib/email-templates";
import { sendTransactionalEmail } from "../../../../cod-shared/lib/transactional-email";
import { dashboardDatabase, dashboardRedis } from "../server-db";
import { serverEnv, type ServerEnv } from "../server-env";
import { redisSecondaryStorage } from "./redis-storage";

/** The store whose name and email settings a merchant's account emails use: its first store. */
async function firstStoreOf(userId: string): Promise<{ storeId: string; merchantId: string } | null> {
  const { rows } = await dashboardDatabase().platform.query<{ store_id: string; merchant_id: string }>(
    `select s.id as store_id, s.merchant_id from users u join stores s on s.merchant_id = u.merchant_id
      where u.id = $1 order by s.created_at, s.id limit 1`,
    [userId],
  );
  return rows[0] ? { storeId: rows[0].store_id, merchantId: rows[0].merchant_id } : null;
}

let instance: ReturnType<typeof buildAuth> | undefined;

/** The better-auth instance — one per process, on the platform pool and Redis. */
export function createAuth() {
  instance ??= buildAuth(serverEnv());
  return instance;
}

function buildAuth(env: ServerEnv) {
  const { app, platform } = dashboardDatabase();
  const db = getDb(platform);

  return betterAuth({
        database: drizzleAdapter(db, {
          provider: "pg",
          usePlural: true,
          schema: { users, sessions, accounts, verifications, jwkss },
        }),
        baseURL: env.PUBLIC_APP_URL,
        secret: env.BETTER_AUTH_SECRET,
        secondaryStorage: redisSecondaryStorage(dashboardRedis),
        trustedOrigins: [
          ...(import.meta.env.DEV ? ["http://localhost:4321"] : []),
          ...(env.PUBLIC_TRUSTED_ORIGINS ?? "")
            .split(",")
            .map((o) => o.trim())
            .filter(Boolean),
        ],
        disabledPaths: ["/token"],
        session: {
          storeSessionInDatabase: true,
          cookieCache: {
            enabled: true,
            maxAge: 5 * 60,
          },
        },
        advanced: {
          ipAddress: {
            // Caddy, our own front proxy, sets X-Forwarded-For from the connection.
            ipAddressHeaders: ["x-forwarded-for"],
          },
        },
        rateLimit: {
          enabled: true,
          window: 60,
          max: 100,
          customRules: {
            "/request-password-reset": { window: 3600, max: 3 },
            "/sign-in/magic-link": { window: 3600, max: 5 },
          },
        },
        emailAndPassword: {
          enabled: true,
          autoSignIn: true,
          // No self-service registration: accounts are provisioned by an admin.
          disableSignUp: true,
          /**
           * Password-reset email via the shared Sendili send path.
           *
           * Security contract: this callback runs only for users that exist,
           * while better-auth answers unknown emails with the same generic
           * "check your email" response — so the callback must never throw
           * or change observable behavior (no enumeration). Every failure is
           * caught here, logged with its stable code, and swallowed.
           * Residual risk (accepted): the provider round-trip adds latency
           * only for existing emails — a timing side channel mitigated by the
           * 3/hour rate limit on /request-password-reset.
           */
          sendResetPassword: async ({ user, url, token }) => {
            try {
              const home = await firstStoreOf(user.id);
              if (!home) return;
              const outcome = await withStore(
                app,
                home.storeId,
                async (storeDb) => {
                  const store = await getStore(storeDb);
                  const language = (user as { language?: string }).language === "ar" ? "ar" : "en";
                  const email = renderPasswordResetEmail({
                    storeName: store?.name ?? "CodFlow",
                    userName: user.name,
                    resetUrl: url,
                    language,
                  });
                  return sendTransactionalEmail(storeDb, {
                    to: user.email,
                    subject: email.subject,
                    html: email.html,
                    text: email.text,
                    idempotencyKey: `reset-${user.id}-${token.slice(0, 12)}`,
                  });
                },
                home.merchantId,
              );
              if (!outcome.sent && outcome.error) {
                console.error("[auth] password-reset email failed:", outcome.error);
              }
            } catch (err) {
              console.error("[auth] password-reset email error:", err);
            }
          },
        },
        user: {
          additionalFields: {
            /**
             * Privileged fields are `input: false` — better-auth's
             * session-authenticated /update-user must never accept them, or
             * any staff member could self-promote (`{role:"admin"}` was
             * accepted before this). Admin-side changes go through
             * cod-server's PATCH /api/users/:id.
             */
            role:     { type: "string", defaultValue: "staff",  required: false, input: false },
            status:   { type: "string", defaultValue: "active", required: false, input: false },
            apiKey:   { type: "string", required: false, input: false },
            /** Email language preference — the one field users may self-edit. */
            language: { type: "string", defaultValue: "en", required: false },
          },
        },
        plugins: [
          // Attaches real scopes (user_scopes join) to every session response so
          // the Identity contract is truthful end-to-end. Not added to the JWT
          // payload — scopes stay server-resolved per request.
          customSession(async ({ user, session }) => {
            const rows = await db
              .select({ scope: userScopes.scope })
              .from(userScopes)
              .where(eq(userScopes.userId, user.id));
            
            // Strip sensitive fields from user object before sending to browser
            const { apiKey, ...safeUser } = user as typeof user & { apiKey?: string };
            
            return {
              user: safeUser,
              session,
              scopes: (user as { role?: string }).role === "admin"
                ? ["*"]
                : rows.map((r) => r.scope),
            };
          }),
          jwt({
            jwt: {
              // Tokens are issued FOR the API resource, matching cod-server's
              // sessionAuth audience check (docs: "Modify Issuer, Audience…").
              audience: env.PUBLIC_API_URL,
              // Default payload embeds the ENTIRE user row — including the
              // plaintext apiKey additionalField. Whitelist instead.
              definePayload: ({ user }) => ({
                id: user.id,
                email: user.email,
                role: (user as { role?: string }).role ?? "staff",
              }),
            },
          }),
        ],
  });
}

