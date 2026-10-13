import { useEffect, useState } from "react";
import { activeStoreId, setActiveStoreId } from "@/lib/active-store";
import { listMyStores } from "./api";
import { pickActiveStore, type MerchantStore } from "./store-choice";

let loading: Promise<MerchantStore[]> | undefined;

/** The merchant's stores and the active one — fetched once per page, shared by every caller. */
export function useMerchantStores() {
  const [stores, setStores] = useState<MerchantStore[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    loading ??= listMyStores();
    loading.then(
      (list) => alive && setStores(list),
      () => alive && setFailed(true),
    );
    return () => {
      alive = false;
    };
  }, []);

  const active = stores ? pickActiveStore(stores, activeStoreId()) : null;
  return { stores, active, failed };
}

/** Make `storeId` the active store and reload, so every screen reads it. */
export function switchToStore(storeId: string): void {
  setActiveStoreId(storeId);
  window.location.reload();
}
