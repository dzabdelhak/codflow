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
import { probeCertificate, type CertificateStatus } from "@/platform/tls-probe";
import { pruneFinishedJobs, startJobWorker } from "@/platform/jobs";
import { pruneBlockedAttempts } from "@/endpoints/store/order-flood";
import { CONVERSION_JOB, conversionJobHandler } from "@/tracking/conversions";

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

function certificateProbe(): (hostname: string) => Promise<CertificateStatus> {
  const host =
    process.env.TLS_PROBE_HOST?.trim() ||
    process.env.CUSTOM_DOMAIN_TARGET?.trim() ||
    process.env.CUSTOM_DOMAIN_IPV4?.split(",")[0].trim();
  if (!host) return async () => ({ status: "error", message: "probe_not_configured" });
  const port = Number(process.env.TLS_PROBE_PORT ?? 443);
  return (hostname) => probeCertificate(hostname, { host, port });
}

const env = {
  ...process.env,
  DATABASE: database,
  IMAGE_STORE: imageStore,
  DOMAIN_DNS: systemDns(process.env.DNS_SERVERS?.split(",").map((s) => s.trim()).filter(Boolean)),
  CERT_PROBE: certificateProbe(),
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
    const prune = () => {
      void pruneFinishedJobs(database.platform).catch((err) => console.error("[cron:prune-jobs]", err));
      void pruneBlockedAttempts(database.platform).catch((err) => console.error("[cron:prune-blocked-attempts]", err));
    };
    setInterval(prune, 24 * 60 * 60 * 1000).unref();
    const stopJobs = startJobWorker(database.platform, { [CONVERSION_JOB]: conversionJobHandler(database.platform) });
    for (const signal of ["SIGINT", "SIGTERM"] as const) {
      process.on(signal, () => {
        stopJobs();
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
