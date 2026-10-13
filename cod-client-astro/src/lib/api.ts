import { PUBLIC_API_URL } from "astro:env/client";

import { currentJwt, refreshJwt } from "@/lib/session";
import { setActiveStoreId, storeHeader } from "@/lib/active-store";

/**
 * Resolve the cod-server origin for browser code.
 *
 * `PUBLIC_API_URL` is baked at build time (astro:env/client), which is fine
 * for a self-hosted deployment where the dashboard and API origins are known
 * when the bundle is produced. Platform deployments can't bake it: one build
 * serves many stores, each with its own API origin. Those deployments follow
 * the `app.<domain>` → `api.<domain>` subdomain convention, so we derive the
 * origin from `window.location` at request time (same scheme and port) and
 * only fall back to the baked value when the convention doesn't apply.
 */
export function publicApiUrl(): string {
  if (typeof window !== "undefined") {
    const { protocol, host } = window.location;
    if (host.startsWith("app.")) {
      return `${protocol}//api.${host.slice("app.".length)}`;
    }
  }
  return PUBLIC_API_URL;
}

/**
 * A saved store the merchant no longer owns (or another merchant's) is
 * answered 403 STORE_NOT_OWNED: forget it, and let the API pick the
 * merchant's first store.
 */
async function forgetsUnownedStore(res: Response): Promise<boolean> {
  if (res.status !== 403 || !storeHeader()["X-Store-Id"]) return false;
  const body = (await res.clone().json().catch(() => null)) as { code?: string } | null;
  if (body?.code !== "STORE_NOT_OWNED") return false;
  setActiveStoreId(null);
  return true;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public category?: string,
    public context?: Record<string, unknown>
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const apiUrl = publicApiUrl();
  const call = () =>
    currentJwt().then((jwt) =>
      fetch(`${apiUrl}${path}`, {
        ...init,
        credentials: "include",
        headers: {
          ...(init.headers ?? {}),
          ...storeHeader(),
          ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
        },
      })
    );

  let res = await call();
  if (res.status === 401) {
    await refreshJwt();
    res = await call();
  }
  if (await forgetsUnownedStore(res)) res = await call();
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    let code: string | undefined;
    let category: string | undefined;
    let context: Record<string, unknown> | undefined;
    try {
      const body = (await res.json()) as {
        error?: string;
        code?: string;
        category?: string;
        context?: Record<string, unknown>;
      };
      message = body.error ?? message;
      code = body.code;
      category = body.category;
      context = body.context;
    } catch {}
    throw new ApiError(message, res.status, code, category, context);
  }
  return (await res.json()) as T;
}

export async function apiFetchBlob(path: string): Promise<Blob> {
  const apiUrl = publicApiUrl();
  const call = () =>
    currentJwt().then((jwt) =>
      fetch(`${apiUrl}${path}`, {
        credentials: "include",
        headers: { ...storeHeader(), ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}) },
      })
    );

  let res = await call();
  if (res.status === 401) {
    await refreshJwt();
    res = await call();
  }
  if (await forgetsUnownedStore(res)) res = await call();
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string; code?: string };
      message = body.error ?? message;
    } catch {}
    throw new ApiError(message, res.status);
  }
  return res.blob();
}
