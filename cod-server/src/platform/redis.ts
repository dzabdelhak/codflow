import { createClient } from "redis";

export type Redis = ReturnType<typeof createClient>;

let client: Redis | null = null;

export async function platformRedis(url: string | undefined): Promise<Redis | null> {
  if (!url) return null;
  if (!client) {
    client = createClient({ url, disableOfflineQueue: true, socket: { reconnectStrategy: (retries) => Math.min(retries * 200, 5000) } });
    client.on("error", (err) => console.error("[redis]", err.message));
    client.connect().catch(() => {});
  }
  return client.isReady ? client : null;
}
