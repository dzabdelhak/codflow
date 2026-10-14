import { useEffect, useState } from "react";
import { activeStoreId, setActiveStoreId } from "@/lib/active-store";
import { listMyStores } from "./api";
import { pickActiveStore, type MerchantStore } from "./store-choice";

let loading: Promise<MerchantStore[]> | undefined;
const listeners = new Set<() => void>();

export function refreshMerchantStores(): void {
  loading = undefined;
  for (const listener of listeners) listener();
}

/** The merchant's stores and the active one — fetched once per page, shared by every caller. */
export function useMerchantStores() {
  const [stores, setStores] = useState<MerchantStore[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const listener = () => setVersion((v) => v + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    loading ??= listMyStores().catch((err) => {
      loading = undefined;
      throw err;
    });
    loading.then(
      (list) => alive && setStores(list),
      () => alive && setFailed(true),
    );
    return () => {
      alive = false;
    };
  }, [version]);

  const active = stores ? pickActiveStore(stores, activeStoreId()) : null;
  return { stores, active, failed };
}

/** Make `storeId` the active store and reload, so every screen reads it. */
export function switchToStore(storeId: string): void {
  setActiveStoreId(storeId);
  window.location.reload();
}
