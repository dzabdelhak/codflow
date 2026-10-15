import { useEffect, useState } from "react";
import { ExternalLink, Save } from "lucide-react";
import { RequireAuth, useIdentity } from "@/features/auth/components/RequireAuth";
import { DashboardChrome } from "@/components/layout/chrome";
import { Alert, Button, Card, Field, Input, PageHeader, Select } from "@/components/ui";
import { useT } from "@/i18n/react";
import { notify } from "@/lib/notify";
import { MESSENGER_LIMITS, normalisePage } from "../../../../cod-shared/messenger-widget/config";
import { getMessengerWidget, saveMessengerWidget, type MessengerWidgetConfig } from "./api";

function MessengerSettings() {
  const t = useT("messenger");
  const auth = useT("auth");
  const identity = useIdentity();
  const [config, setConfig] = useState<MessengerWidgetConfig | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getMessengerWidget().then(setConfig, () => setFailed(true));
  }, []);

  if (identity?.role !== "admin") return <Alert role="alert" tone="critical">{auth("no_access")}</Alert>;
  if (failed) return <Alert role="alert" tone="critical">{t("load_failed")}</Alert>;
  if (!config) return <div role="status" aria-busy="true" className="h-48 animate-pulse rounded-xl bg-muted" />;

  const update = (changes: Partial<MessengerWidgetConfig>) => setConfig({ ...config, ...changes });
  const page = normalisePage(config.page);

  async function save() {
    setBusy(true);
    try {
      setConfig(await saveMessengerWidget(config!));
      notify.success(t("saved"));
    } catch {
      notify.error(t("save_failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="space-y-4 p-4">
        <label className="flex cursor-pointer items-center gap-3 text-sm font-semibold">
          <input type="checkbox" className="size-4 accent-primary" checked={config.enabled} onChange={(event) => update({ enabled: event.currentTarget.checked })} />
          {t("enabled")}
        </label>
        <Field label={t("page_label")} hint={t("page_hint")}>
          <Input
            value={config.page}
            dir="ltr"
            maxLength={200}
            placeholder={t("page_placeholder")}
            onChange={(event) => update({ page: event.currentTarget.value })}
          />
        </Field>
        <Field label={t("position_label")} hint={t("stacked_note")}>
          <Select value={config.position} onChange={(event) => update({ position: event.currentTarget.value as MessengerWidgetConfig["position"] })}>
            <option value="right">{t("position_right")}</option>
            <option value="left">{t("position_left")}</option>
          </Select>
        </Field>
        <Field label={t("label_label")} hint={t("label_hint")}>
          <Input
            value={config.label}
            maxLength={MESSENGER_LIMITS.MAX_LABEL_LENGTH}
            placeholder={t("label_placeholder")}
            onChange={(event) => update({ label: event.currentTarget.value })}
          />
        </Field>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {page && (
            <a href={`https://m.me/${page}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand">
              <ExternalLink size={14} aria-hidden="true" />
              {t("preview_link")}
            </a>
          )}
          <Button type="button" onClick={() => void save()} disabled={busy}>
            <Save size={16} />
            {busy ? t("saving") : t("save")}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function Gated() {
  const t = useT("messenger");
  return (
    <DashboardChrome currentPath="/messenger">
      <PageHeader title={t("page_title")} subtitle={t("page_subtitle")} />
      <MessengerSettings />
    </DashboardChrome>
  );
}

export default function MessengerPageApp() {
  return (
    <RequireAuth>
      <Gated />
    </RequireAuth>
  );
}
