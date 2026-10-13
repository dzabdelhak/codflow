#!/usr/bin/env node
/**
 * Seed (or reset) a merchant's admin user.
 *
 * Usage (run from cod-client-astro/):
 *   DATABASE_URL=postgres://… node scripts/seed-admin.mjs [password] [--merchant=<id>]
 *
 * The admin email/name come from $ADMIN_EMAIL / $ADMIN_NAME (defaults to
 * admin@example.com / Admin). Without --merchant, the database must hold
 * exactly one merchant. Re-running resets the password and API key.
 *
 * Uses the same scrypt params as @better-auth/utils/password so the hash
 * is verifiable by better-auth at runtime.
 */
import { scrypt, randomBytes } from "node:crypto";
import { promisify } from "node:util";
import pg from "pg";

const scryptAsync = promisify(scrypt);

// Must match @better-auth/utils/password config exactly
const SCRYPT = { N: 16384, r: 16, p: 1, dkLen: 64 };

async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const key = await scryptAsync(
    password.normalize("NFKC"),
    salt,
    SCRYPT.dkLen,
    { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: 128 * SCRYPT.N * SCRYPT.r * 2 }
  );
  return `${salt}:${key.toString("hex")}`;
}

const uid = () => randomBytes(16).toString("hex");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const args = process.argv.slice(2);
  const password = args.find((a) => !a.startsWith("--")) ?? randomBytes(12).toString("base64url");
  const merchantArg = args.find((a) => a.startsWith("--merchant="))?.slice("--merchant=".length);

  const email = process.env.ADMIN_EMAIL ?? "admin@example.com";
  const name = process.env.ADMIN_NAME ?? "Admin";
  const apiKey = `cod_${randomBytes(16).toString("hex")}`;
  const hashedPw = await hashPassword(password);
  const now = new Date();

  // Identity is platform data: written as the platform role.
  const client = new pg.Client({ connectionString: url, options: "-c role=codflow_platform" });
  await client.connect();
  try {
    let merchantId = merchantArg;
    if (!merchantId) {
      const { rows } = await client.query("select id from merchants order by created_at limit 2");
      if (rows.length !== 1) {
        throw new Error(`Pass --merchant=<id>: the database has ${rows.length} merchants (run cod-server db:setup first).`);
      }
      merchantId = rows[0].id;
    }

    await client.query("begin");
    // Credential accounts must match Better Auth >= 1.7 lookup semantics:
    // provider_id = 'credential', issuer = 'local:credential', account_id = user id.
    const { rows } = await client.query(
      `insert into users (id, name, email, email_verified, role, status, api_key, merchant_id, created_at, updated_at)
       values ($1, $2, $3, true, 'admin', 'active', $4, $5, $6, $6)
       on conflict (email) do update set api_key = excluded.api_key, updated_at = excluded.updated_at
       returning id, merchant_id`,
      [uid(), name, email, apiKey, merchantId, now],
    );
    const userId = rows[0].id;
    await client.query("delete from accounts where user_id = $1 and provider_id = 'credential'", [userId]);
    await client.query(
      `insert into accounts (id, user_id, account_id, provider_id, issuer, password, created_at, updated_at)
       values ($1, $2, $2, 'credential', 'local:credential', $3, $4, $4)`,
      [uid(), userId, hashedPw, now],
    );
    await client.query("commit");

    console.log("\n╔══════════════════════════════════════════════════════════╗");
    console.log("║                 Admin user seeded                       ║");
    console.log("╠══════════════════════════════════════════════════════════╣");
    console.log(`║  Email    : ${email.padEnd(44)} ║`);
    console.log(`║  Password : ${password.padEnd(44)} ║`);
    console.log(`║  API Key  : ${apiKey.padEnd(44)} ║`);
    console.log(`║  Merchant : ${rows[0].merchant_id.padEnd(44)} ║`);
    console.log("╚══════════════════════════════════════════════════════════╝");
    console.log("\nSave these credentials — they won't be shown again.\n");
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
