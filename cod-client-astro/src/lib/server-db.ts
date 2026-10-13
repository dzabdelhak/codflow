/**
 * The dashboard server's database pools and Redis client — one per process.
 * Identity (users, sessions, credentials) is platform data, read through the
 * platform pool; anything store-owned goes through `withStore` on the app pool.
 */
import { createClient } from "redis";
import { createDatabase, type Database } from "../../../cod-shared/db/pools";
import { serverEnv } from "./server-env";

let database: Database | undefined;
let redis: ReturnType<typeof createClient> | undefined;
let redisReady: Promise<unknown> | undefined;

export function dashboardDatabase(): Database {
  database ??= createDatabase(serverEnv().DATABASE_URL);
  return database;
}

export async function dashboardRedis() {
  if (!redis) {
    redis = createClient({ url: serverEnv().REDIS_URL });
    redis.on("error", (err) => console.error("[redis]", err.message));
    redisReady = redis.connect();
  }
  await redisReady;
  return redis;
}
