const KEY = "codflow.activeStoreId";

export function activeStoreId(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setActiveStoreId(id: string | null): void {
  try {
    if (id) window.localStorage.setItem(KEY, id);
    else window.localStorage.removeItem(KEY);
  } catch {}
}

export function storeHeader(): Record<string, string> {
  const id = typeof window === "undefined" ? null : activeStoreId();
  return id ? { "X-Store-Id": id } : {};
}
