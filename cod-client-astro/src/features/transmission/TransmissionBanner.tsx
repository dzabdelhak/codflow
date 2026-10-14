import { useEffect, useState } from "react";
import { canScope, useIdentity } from "@/features/auth/components/RequireAuth";
import { useT } from "@/i18n/react";
import { activeStoreId } from "@/lib/active-store";
import { SCOPES } from "../../../../cod-shared/rbac/scopes";
import { getTransmissionAlerts, type TransmissionAlerts } from "./api";

const CACHE_MS = 5 * 60 * 1000;
type Alerts = TransmissionAlerts;

export function TransmissionBanner({ currentPath }: { currentPath: string }) {
  const t = useT("transmission");
  const identity = useIdentity();
  const [alerts, setAlerts] = useState<Alerts>({ stale: 0, rejected: 0, aventyKey: null });
  const enabled = identity?.role === "admin" && canScope(identity, SCOPES.ORDERS_READ) && currentPath !== "/orders/transmission";
  const cacheKey = `cod:transmission-alerts:${activeStoreId() ?? "default"}`;

  useEffect(() => {
    if (!enabled) return;
    try {
      const cached = JSON.parse(sessionStorage.getItem(cacheKey) ?? "null") as ({ at: number } & Alerts) | null;
      if (cached && Date.now() - cached.at < CACHE_MS) return setAlerts(cached);
    } catch {}
    getTransmissionAlerts().then(
      (fresh) => {
        setAlerts(fresh);
        try {
          sessionStorage.setItem(cacheKey, JSON.stringify({ at: Date.now(), ...fresh }));
        } catch {}
      },
      () => {},
    );
  }, [enabled, cacheKey]);

  if (!enabled || (alerts.stale === 0 && alerts.rejected === 0 && !alerts.aventyKey)) return null;
  return (
    <a
      href="/orders/transmission"
      role="alert"
      className="mb-4 block space-y-0.5 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm font-semibold text-destructive hover:bg-destructive/10"
    >
      {alerts.stale > 0 && <p>{t("stale_alert").replace("{n}", String(alerts.stale))}</p>}
      {alerts.rejected > 0 && <p>{t("rejected_alert").replace("{n}", String(alerts.rejected))}</p>}
      {alerts.aventyKey && <p>{t(`aventy_key_${alerts.aventyKey}_alert`)}</p>}
    </a>
  );
}
