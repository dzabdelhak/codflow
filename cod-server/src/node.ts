/**
 * Node.js entry point (ADR-0003).
 *
 *   DATABASE_URL=postgres://… STOREFRONT_SERVICE_KEY=… npx tsx src/node.ts
 *
 * Stateless: any number of these can run behind the reverse proxy.
 */
import { serve } from "@hono/node-server";
import app from "@/app";
import { createDatabase } from "@/db/scope";
import type { Env } from "@/types";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`${name} is required`);
    process.exit(1);
  }
  return value;
}

const database = createDatabase(required("DATABASE_URL"));

const env = {
  ...process.env,
  DATABASE: database,
  ENVIRONMENT: process.env.ENVIRONMENT ?? "development",
} as unknown as Env;

// Handlers hand post-response work to waitUntil; on Node it simply runs on,
// and a failure is logged rather than lost.
const executionCtx = {
  waitUntil(promise: Promise<unknown>) {
    promise.catch((err) => console.error("[waitUntil]", err));
  },
  passThroughOnException() {},
  props: {},
};

const port = Number(process.env.PORT ?? 8787);
const server = serve({ fetch: (request) => app.fetch(request, env, executionCtx as never), port }, () =>
  console.log(`cod-server listening on :${port}`),
);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close();
    void database.close().finally(() => process.exit(0));
  });
}
