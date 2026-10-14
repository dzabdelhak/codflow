import { createClient } from "redis";

export type Redis = ReturnType<typeof createClient>;

let client: Redis | null = null;
let ready: Promise<unknown> | null = null;

export async function platformRedis(url: string | undefined): Promise<Redis | null> {
  if (!url) return null;
  if (!client) {
    client = createClient({ url, socket: { reconnectStrategy: (retries) => Math.min(retries * 200, 5000) } });
    client.on("error", (err) => console.error("[redis]", err.message));
    ready = client.connect();
  }
  try {
    await ready;
    return client.isReady ? client : null;
  } catch {
    return null;
  }
}
