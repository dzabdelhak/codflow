import { useEffect, useState } from "react";
import { PlugZap } from "lucide-react";
import { Alert, Badge } from "@/components/ui";
import { useLocale, useT } from "@/i18n/react";
import { notify } from "@/lib/notify";
import { getAventyKey, getAventySync, removeAventyKey, saveAventyKey } from "@/features/settings/api";
import type { AventyKeyStatus, AventySyncRow } from "@/features/settings/types";
import { FieldRow, SettingsSection, inputCls } from "@/features/settings/components/SettingsSection";

export function AventySettings() {
  const t = useT("settings");
  const locale = useLocale();
  const [status, setStatus] = useState<AventyKeyStatus | null>(null);
  const [sync, setSync] = useState<AventySyncRow[]>([]);
  const [key, setKey] = useState("");
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    getAventyKey().then(setStatus, () => {});
    getAventySync().then(setSync, () => {});
  }, []);

  async function handleSave() {
    if (!key.trim()) throw new Error(t("store.aventy_key_required"));
    setStatus(await saveAventyKey(key.trim()));
    setKey("");
  }

  async function handleRemove() {
    setRemoving(true);
    try {
      setStatus(await removeAventyKey());
      notify.success(t("store.aventy_removed"));
    } catch {
      notify.error(t("store.save_error"));
    } finally {
      setRemoving(false);
    }
  }

  const when = (value: string | null) => (value ? new Date(value).toLocaleString(locale) : null);

  return (
    <SettingsSection icon={PlugZap} title={t("store.aventy_title")} subtitle={t("store.aventy_subtitle")} onSave={handleSave}>
      {status && !status.encryptionConfigured && (
        <Alert role="alert" tone="warning">{t("store.aventy_not_configured")}</Alert>
      )}
      {status?.status === "revoked" && (
        <Alert role="alert" tone="critical">
          {t("store.aventy_revoked").replace("{date}", when(status.statusChangedAt) ?? "—")}
        </Alert>
      )}

      <FieldRow label={t("store.aventy_key_label")} hint={t("store.aventy_key_hint")}>
        <div className="space-y-2">
          <input
            type="password"
            dir="ltr"
            autoComplete="off"
            spellCheck={false}
            value={key}
            onChange={(event) => setKey(event.target.value)}
            placeholder={status?.hint ?? t("store.aventy_key_placeholder")}
            aria-label={t("store.aventy_key_label")}
            className={inputCls}
            disabled={status?.encryptionConfigured === false}
          />
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {status?.configured ? (
              <>
                <Badge tone={status.status === "active" ? "success" : "critical"} size="sm">
                  {t(`store.aventy_status_${status.status}`)}
                </Badge>
                <span dir="ltr">{status.hint}</span>
                <button
                  type="button"
                  onClick={() => void handleRemove()}
                  disabled={removing}
                  className="font-semibold text-destructive underline-offset-2 hover:underline disabled:opacity-60"
                >
                  {t("store.aventy_remove")}
                </button>
              </>
            ) : (
              <span>{t("store.aventy_key_none")}</span>
            )}
          </div>
        </div>
      </FieldRow>

      <FieldRow label={t("store.aventy_sync_title")} hint={t("store.aventy_sync_hint")}>
        <ul className="space-y-1.5 text-sm">
          {(["catalogue", "delivery"] as const).map((domain) => {
            const row = sync.find((r) => r.domain === domain);
            return (
              <li key={domain} className="flex flex-wrap items-baseline gap-2">
                <span className="font-semibold text-foreground">{t(`store.aventy_domain_${domain}`)}</span>
                <span className="text-xs text-muted-foreground">
                  {row?.syncedAt ? t("store.aventy_last_synced").replace("{date}", when(row.syncedAt)!) : t("store.aventy_never_synced")}
                </span>
                {row?.lastError && <span className="text-xs font-semibold text-destructive">{row.lastError}</span>}
              </li>
            );
          })}
        </ul>
      </FieldRow>
    </SettingsSection>
  );
}
