/**
 * Node.js entry point (ADR-0003).
 *
 *   DATABASE_URL=postgres://… STOREFRONT_SERVICE_KEY=… npx tsx src/node.ts
 *
 * Stateless: any number of these can run behind the reverse proxy.
 */
import { serve } from "@hono/node-server";
import app from "@/app";
import { createDatabase, createPool } from "@/db/scope";
import type { Env } from "@/types";
import { s3ImageStore } from "@/platform/image-store";
import { runOrphanImageSweep } from "@/cron/sweep-orphan-images";
import { sweepAbandonedOrders } from "@/cron/sweep-abandoned-orders";
import { systemDns } from "@/platform/channel-domains";
import { probeCertificate, type CertificateStatus } from "@/platform/tls-probe";
import { pruneFinishedJobs, startJobWorker } from "@/platform/jobs";
import { scheduledTaskHandlers, startScheduler, type ScheduledTask } from "@/platform/schedule";
import { checkDomainCertificates } from "@/platform/domain-certificates";
import { pruneBlockedAttempts } from "@/endpoints/store/order-flood";
import { outboundOptionsFromEnv, startOutboundWorker } from "@/platform/outbound/worker";
import { destinationFromEnv } from "@/platform/outbound/destination";
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

const probeHost =
  process.env.TLS_PROBE_HOST?.trim() ||
  process.env.CUSTOM_DOMAIN_TARGET?.trim() ||
  process.env.CUSTOM_DOMAIN_IPV4?.split(",")[0].trim();

function certificateProbe(): (hostname: string) => Promise<CertificateStatus> {
  const host = probeHost;
  if (!host) return async () => ({ status: "error", message: "probe_not_configured" });
  const port = Number(process.env.TLS_PROBE_PORT ?? 443);
  return (hostname) => probeCertificate(hostname, { host, port });
}

const outboundDestination = destinationFromEnv(process.env);

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
let draining = false;

async function handle(request: Request): Promise<Response> {
  if (draining && new URL(request.url).pathname === "/health") return new Response("draining", { status: 503 });
  const response = await app.fetch(request, env, executionCtx as never);
  if (!draining) return response;
  const closing = new Response(response.body, response);
  closing.headers.set("Connection", "close");
  return closing;
}

imageStore.ensureBucket().then(
  () => {
    const server = serve({ fetch: handle, port }, () =>
      console.log(`cod-server listening on :${port}`),
    );
    const day = 24 * 60 * 60 * 1000;
    const tasks: ScheduledTask[] = [
      { kind: "task:sweep-orphan-images", everyMs: day, run: () => runOrphanImageSweep(env) },
      { kind: "task:sweep-abandoned-orders", everyMs: 15 * 60 * 1000, run: () => sweepAbandonedOrders(env) },
      {
        kind: "task:prune",
        everyMs: day,
        run: async () => ({ jobs: await pruneFinishedJobs(database.platform), blockedAttempts: await pruneBlockedAttempts(database.platform) }),
      },
      ...(probeHost
        ? [{
            kind: "task:check-certificates",
            everyMs: 60 * 60 * 1000,
            run: () => checkDomainCertificates(database.platform, env.CERT_PROBE, { requireTrusted: env.ENVIRONMENT === "production" }),
          }]
        : []),
    ];
    const stopJobs = startJobWorker(database.platform, { [CONVERSION_JOB]: conversionJobHandler(database.platform), ...scheduledTaskHandlers(tasks) });
    const stopScheduler = startScheduler(database.platform, tasks);
    const outboundOptions = outboundOptionsFromEnv(process.env);
    const outboundPool = createPool(required("DATABASE_URL"), "codflow_platform", outboundOptions.senders + 1);
    const stopOutbound = startOutboundWorker(outboundPool, outboundDestination, outboundOptions);
    const drain = () => {
      if (draining) return;
      draining = true;
      stopScheduler();
      stopJobs();
      stopOutbound();
      setTimeout(() => process.exit(1), 25_000).unref();
      server.close(() => void Promise.allSettled([outboundPool.end(), database.close()]).finally(() => process.exit(0)));
      if ("closeIdleConnections" in server) server.closeIdleConnections();
    };
    process.on("SIGINT", drain);
    process.on("SIGTERM", drain);
  },
  (err) => {
    console.error("Image storage is unreachable", err);
    process.exit(1);
  },
);
