// ╔══════════════════════════════════════════════════════════════════════╗
// ║  CORE ENGINE — DO NOT MODIFY                                         ║
// ║  The request being rendered. One storefront serves every channel;    ║
// ║  this is how the API client knows which one.                         ║
// ╚══════════════════════════════════════════════════════════════════════╝
import { AsyncLocalStorage } from "node:async_hooks";

interface RequestContext {
  host: string;
  memo: Map<string, Promise<unknown>>;
}

const current = new AsyncLocalStorage<RequestContext>();

/** Runs `render` with `host` as the current request's hostname. */
export function withRequestHost<T>(host: string, render: () => Promise<T>): Promise<T> {
  return current.run({ host, memo: new Map() }, render);
}

/** The hostname of the request being rendered, or undefined outside one. */
export function currentRequestHost(): string | undefined {
  return current.getStore()?.host;
}

/**
 * `load` once per request: later calls with the same key in the same request
 * share its result. Outside a request nothing is cached.
 */
export function memoForRequest<T>(key: string, load: () => Promise<T>): Promise<T> {
  const memo = current.getStore()?.memo;
  if (!memo) return load();
  if (!memo.has(key)) memo.set(key, load());
  return memo.get(key) as Promise<T>;
}
