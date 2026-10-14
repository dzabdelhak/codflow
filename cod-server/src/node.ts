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
import { s3ImageStore } from "@/platform/image-store";
import { runOrphanImageSweep } from "@/cron/sweep-orphan-images";
import { systemDns } from "@/platform/channel-domains";
import { probeCertificate } from "@/platform/tls-probe";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`${name} is required`);
    process.exit(1);
  }
  return value;
}

const database = createDatabase(required("DATABASE_URL"));
const imageStore = s3ImageStore({
  endpoint: required("S3_ENDPOINT"),
  bucket: process.env.S3_BUCKET ?? "codflow-images",
  accessKeyId: required("S3_ACCESS_KEY_ID"),
  secretAccessKey: required("S3_SECRET_ACCESS_KEY"),
  region: process.env.S3_REGION,
});

const env = {
  ...process.env,
  DATABASE: database,
  IMAGE_STORE: imageStore,
  DOMAIN_DNS: systemDns(process.env.DNS_SERVERS?.split(",").map((s) => s.trim()).filter(Boolean)),
  CERT_PROBE: (hostname: string) =>
    probeCertificate(hostname, { host: process.env.TLS_PROBE_HOST || hostname, port: Number(process.env.TLS_PROBE_PORT ?? 443) }),
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

imageStore.ensureBucket().then(
  () => {
    const server = serve({ fetch: (request) => app.fetch(request, env, executionCtx as never), port }, () =>
      console.log(`cod-server listening on :${port}`),
    );
    const sweep = () => void runOrphanImageSweep(env).catch((err) => console.error("[cron:sweep-orphan-images]", err));
    setTimeout(sweep, 60_000).unref();
    setInterval(sweep, 24 * 60 * 60 * 1000).unref();
    for (const signal of ["SIGINT", "SIGTERM"] as const) {
      process.on(signal, () => {
        server.close();
        void database.close().finally(() => process.exit(0));
      });
    }
  },
  (err) => {
    console.error("Image storage is unreachable", err);
    process.exit(1);
  },
);
