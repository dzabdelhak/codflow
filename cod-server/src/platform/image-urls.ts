import type { Env } from "@/types";

/** Public base of /images: IMAGES_PUBLIC_URL, else this API's own origin. */
export function imagesBaseUrl(env: Pick<Env, "IMAGES_PUBLIC_URL" | "WORKER_SELF_URL">, requestUrl?: string): string {
  const base = env.IMAGES_PUBLIC_URL ?? `${requestUrl ? new URL(requestUrl).origin : env.WORKER_SELF_URL}/images`;
  return base.replace(/\/$/, "");
}
