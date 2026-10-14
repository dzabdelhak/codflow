import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import { Input } from "@/components/ui";
import { useT } from "@/i18n/react";
import type { StoreConfig } from "@/features/settings/types";
import { FieldRow, SettingsSection } from "@/features/settings/components/SettingsSection";

export function OrderLimitSettings({
  storeConfig,
  onSave,
}: {
  storeConfig: StoreConfig;
  onSave: (payload: { orderLimitMinutes?: number }) => Promise<void>;
}) {
  const t = useT("settings");
  const [minutes, setMinutes] = useState(String(storeConfig.orderLimitMinutes ?? 10));

  return (
    <SettingsSection
      icon={ShieldAlert}
      title={t("store.order_limit_title")}
      subtitle={t("store.order_limit_subtitle")}
      onSave={async () => {
        const value = Number(minutes);
        if (!Number.isInteger(value) || value < 0 || value > 1440) throw new Error(t("store.order_limit_invalid"));
        await onSave({ orderLimitMinutes: value });
      }}
    >
      <FieldRow label={t("store.order_limit_label")} hint={t("store.order_limit_hint")}>
        <Input type="number" inputMode="numeric" min={0} max={1440} dir="ltr" className="max-w-32" value={minutes} onChange={(e) => setMinutes(e.currentTarget.value)} />
      </FieldRow>
      <p className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
        {t("store.order_limit_note")}
      </p>
    </SettingsSection>
  );
}
