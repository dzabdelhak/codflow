import { useEffect, useState } from "react";
import { canScope, useIdentity } from "@/features/auth/components/RequireAuth";
import { useT } from "@/i18n/react";
import { SCOPES } from "../../../../cod-shared/rbac/scopes";
import { getTransmissionAlerts } from "./api";

const CACHE_KEY = "cod:transmission-alerts";
const CACHE_MS = 5 * 60 * 1000;

export function TransmissionBanner({ currentPath }: { currentPath: string }) {
  const t = useT("transmission");
  const identity = useIdentity();
  const [stale, setStale] = useState(0);
  const enabled = identity?.role === "admin" && canScope(identity, SCOPES.ORDERS_READ) && currentPath !== "/orders/transmission";

  useEffect(() => {
    if (!enabled) return;
    try {
      const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) ?? "null") as { at: number; stale: number } | null;
      if (cached && Date.now() - cached.at < CACHE_MS) return setStale(cached.stale);
    } catch {}
    getTransmissionAlerts().then(
      (alerts) => {
        setStale(alerts.stale);
        try {
          sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), stale: alerts.stale }));
        } catch {}
      },
      () => {},
    );
  }, [enabled]);

  if (!enabled || stale === 0) return null;
  return (
    <a
      href="/orders/transmission"
      role="alert"
      className="mb-4 block rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm font-semibold text-destructive hover:bg-destructive/10"
    >
      {t("stale_alert").replace("{n}", String(stale))}
    </a>
  );
}
