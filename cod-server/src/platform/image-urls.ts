import type { Env } from "@/types";

export function imagesBaseUrl(env: Pick<Env, "IMAGES_PUBLIC_URL" | "WORKER_SELF_URL">, requestUrl?: string): string | null {
  const origin = requestUrl ? new URL(requestUrl).origin : env.WORKER_SELF_URL;
  const base = env.IMAGES_PUBLIC_URL ?? (origin ? `${origin}/images` : null);
  return base ? base.replace(/\/$/, "") : null;
}
