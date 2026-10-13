/**
 * Server-side configuration of the dashboard, read from the environment.
 * Server code only — never import from a client island.
 */
export interface ServerEnv {
  DATABASE_URL: string;
  REDIS_URL: string;
  PUBLIC_APP_URL: string;
  PUBLIC_API_URL: string;
  PUBLIC_TRUSTED_ORIGINS?: string;
  BETTER_AUTH_SECRET: string;
  /** HMAC secret (>= 32 bytes) shared with cod-server for MCP login tickets; missing = the relay fails closed. */
  MCP_LOGIN_TICKET_SECRET?: string;
}

const REQUIRED = ["DATABASE_URL", "REDIS_URL", "PUBLIC_APP_URL", "PUBLIC_API_URL", "BETTER_AUTH_SECRET"] as const;

export function serverEnv(): ServerEnv {
  const missing = REQUIRED.filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`Missing dashboard environment: ${missing.join(", ")}`);
  return process.env as unknown as ServerEnv;
}
