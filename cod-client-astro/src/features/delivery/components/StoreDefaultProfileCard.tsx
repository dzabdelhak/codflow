import { useEffect, useState } from "react";
import { Card, Field, Select } from "@/components/ui";
import { useT } from "@/i18n/react";
import { notify } from "@/lib/notify";
import { getMyStore, updateMyStore } from "@/features/settings/api";
import type { ShippingProfile } from "@/features/delivery/types";

export function StoreDefaultProfileCard({ profiles, canManage }: { profiles: ShippingProfile[]; canManage: boolean }) {
  const t = useT("settings");
  const [value, setValue] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    getMyStore().then(
      (store) => alive && setValue(store.defaultShippingProfileId ?? null),
      () => alive && setValue(undefined),
    );
    return () => {
      alive = false;
    };
  }, []);

  if (value === undefined || profiles.length === 0) return null;
  const accountDefault = profiles.find((profile) => profile.isDefault);

  async function change(next: string) {
    const id = next === "" ? null : next;
    setBusy(true);
    try {
      await updateMyStore({ defaultShippingProfileId: id });
      setValue(id);
      notify.success(t("shipping.store_default_saved"));
    } catch {
      notify.error(t("shipping.store_default_failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title={t("shipping.store_default_title")}>
      <p className="mb-3 text-xs text-muted-foreground">{t("shipping.store_default_hint")}</p>
      <Field label={t("shipping.store_default_label")}>
        <Select value={value ?? ""} onChange={(event) => void change(event.currentTarget.value)} disabled={!canManage || busy}>
          <option value="">
            {t("shipping.store_default_account").replace("{name}", accountDefault?.name ?? "—")}
          </option>
          {profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.name}
            </option>
          ))}
        </Select>
      </Field>
    </Card>
  );
}
