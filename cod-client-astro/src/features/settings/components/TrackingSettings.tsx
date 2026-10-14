import { useEffect, useState, type ReactNode } from "react";
import { BarChart2, Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui";
import { useT } from "@/i18n/react";
import {
  ConversionEventPicker,
  type ConversionEvent,
} from "@/components/tracking/ConversionEventPicker";
import { getPixelConfig, savePixelConfig } from "@/features/settings/api";
import { FieldRow, SettingsSection } from "@/features/settings/components/SettingsSection";
import { TrackingDiagnostics } from "@/features/settings/components/TrackingDiagnostics";
import { isValidIdentifier, type IdentifierField } from "../../../../../cod-shared/tracking/identifiers";

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (next: boolean) => void; label: string; hint: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-1">
        <span className="text-sm font-semibold text-foreground">{label}</span>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
          checked ? "bg-primary" : "bg-muted-foreground/30"
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition-transform ${
            checked ? "translate-x-5 rtl:-translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}

function SecretInput({ value, onChange, masked, placeholder }: { value: string; onChange: (v: string) => void; masked: string | null; placeholder: string }) {
  const t = useT("settings");
  const [shown, setShown] = useState(false);
  return (
    <>
      <div className="relative">
        <Input
          type={shown ? "text" : "password"}
          dir="ltr"
          autoComplete="off"
          value={value}
          onChange={(event) => onChange(event.currentTarget.value)}
          placeholder={masked ?? placeholder}
          className="pe-10"
        />
        <button
          type="button"
          onClick={() => setShown((current) => !current)}
          tabIndex={-1}
          aria-label={shown ? t("store.api_key_hide") : t("store.api_key_reveal")}
          className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
        >
          {shown ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
      {masked && !value && (
        <p className="text-xs text-muted-foreground">
          {t("store.otp_key_stored")}: <span dir="ltr">{masked}</span>
        </p>
      )}
    </>
  );
}

function ProviderBlock({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-4 rounded-xl border border-border/80 p-4">
      <legend className="px-1 text-sm font-bold text-foreground">{title}</legend>
      <p className="-mt-2 text-xs text-muted-foreground">{note}</p>
      {children}
    </fieldset>
  );
}

type Masked = { meta: string | null; tiktok: string | null; snap: string | null; ga4: string | null };

const EMPTY = {
  pixelId: "",
  adAccountName: "",
  testEventCode: "",
  tiktokPixelId: "",
  tiktokTestEventCode: "",
  snapPixelId: "",
  ga4MeasurementId: "",
  googleAdsId: "",
  googleAdsLabel: "",
};

const EMPTY_SECRETS = { meta: "", tiktok: "", snap: "", ga4: "" };

export function TrackingSettings() {
  const t = useT("settings");
  const [fields, setFields] = useState(EMPTY);
  const [secrets, setSecrets] = useState(EMPTY_SECRETS);
  const [masked, setMasked] = useState<Masked>({ meta: null, tiktok: null, snap: null, ga4: null });
  const [testMode, setTestMode] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [consentRequired, setConsentRequired] = useState(false);
  const [conversionEvent, setConversionEvent] = useState<ConversionEvent | null>(null);
  const [perPageTracking, setPerPageTracking] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [savedVersion, setSavedVersion] = useState(0);

  const set = (key: keyof typeof EMPTY) => (value: string) => setFields((current) => ({ ...current, [key]: value }));
  const setSecret = (key: keyof typeof EMPTY_SECRETS) => (value: string) => setSecrets((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    let alive = true;
    getPixelConfig().then((data) => {
      if (!alive || !data) return;
      setFields({
        pixelId: data.pixelId ?? "",
        adAccountName: data.adAccountName ?? "",
        testEventCode: data.testEventCode ?? "",
        tiktokPixelId: data.tiktokPixelId ?? "",
        tiktokTestEventCode: data.tiktokTestEventCode ?? "",
        snapPixelId: data.snapPixelId ?? "",
        ga4MeasurementId: data.ga4MeasurementId ?? "",
        googleAdsId: data.googleAdsId ?? "",
        googleAdsLabel: data.googleAdsLabel ?? "",
      });
      setMasked({
        meta: data.accessTokenMasked || null,
        tiktok: data.tiktokAccessTokenMasked,
        snap: data.snapAccessTokenMasked,
        ga4: data.ga4ApiSecretMasked,
      });
      setConversionEvent(data.conversionEvent);
      setTestMode(data.testMode);
      setEnabled(data.enabled);
      setConsentRequired(data.consentRequired);
      setPerPageTracking(data.perPageTrackingEnabled);
      setLastSaved(data.updatedAt);
    });
    return () => {
      alive = false;
    };
  }, []);

  function required(label: string): never {
    throw new Error(`${label} ${t("store.field_required")}`);
  }

  function checkFormat(field: IdentifierField, value: string, label: string) {
    if (value.trim() && !isValidIdentifier(field, value)) {
      throw new Error(t("store.tracking_invalid_id").replace("{field}", label));
    }
  }

  async function handleSave() {
    const f = Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v.trim()])) as typeof EMPTY;
    if (!conversionEvent) required(t("store.tracking_event_label"));
    checkFormat("metaPixelId", f.pixelId, t("store.tracking_pixel_id_label"));
    checkFormat("tiktokPixelId", f.tiktokPixelId, t("store.tracking_tiktok_pixel_label"));
    checkFormat("snapPixelId", f.snapPixelId, t("store.tracking_snap_pixel_label"));
    checkFormat("ga4MeasurementId", f.ga4MeasurementId, t("store.tracking_ga4_id_label"));
    checkFormat("googleAdsId", f.googleAdsId, t("store.tracking_gads_id_label"));
    checkFormat("googleAdsLabel", f.googleAdsLabel, t("store.tracking_gads_label_label"));
    if (f.googleAdsLabel && !f.googleAdsId) required(t("store.tracking_gads_id_label"));
    if (enabled && f.pixelId && !secrets.meta.trim() && !masked.meta) required(t("store.tracking_token_label"));
    if (enabled && testMode && f.pixelId && !f.testEventCode) required(t("store.tracking_test_code_label"));

    const result = await savePixelConfig({
      pixelId: f.pixelId || null,
      adAccountName: f.adAccountName || null,
      accessToken: secrets.meta.trim() || undefined,
      testEventCode: f.testEventCode || null,
      conversionEvent: conversionEvent!,
      testMode,
      enabled,
      perPageTrackingEnabled: perPageTracking,
      tiktokPixelId: f.tiktokPixelId || null,
      tiktokAccessToken: secrets.tiktok.trim() || undefined,
      tiktokTestEventCode: f.tiktokTestEventCode || null,
      snapPixelId: f.snapPixelId || null,
      snapAccessToken: secrets.snap.trim() || undefined,
      ga4MeasurementId: f.ga4MeasurementId || null,
      ga4ApiSecret: secrets.ga4.trim() || undefined,
      googleAdsId: f.googleAdsId || null,
      googleAdsLabel: f.googleAdsLabel || null,
      consentRequired,
    });
    setMasked({
      meta: result.accessTokenMasked || null,
      tiktok: result.tiktokAccessTokenMasked,
      snap: result.snapAccessTokenMasked,
      ga4: result.ga4ApiSecretMasked,
    });
    setSecrets(EMPTY_SECRETS);
    setLastSaved(result.updatedAt);
    setSavedVersion((v) => v + 1);
  }

  return (
    <div className="space-y-6">
      <SettingsSection icon={BarChart2} title={t("store.tracking_title")} subtitle={t("store.tracking_subtitle")} onSave={handleSave}>
        <Toggle checked={enabled} onChange={setEnabled} label={t("store.tracking_enabled_label")} hint={t("store.tracking_enabled_hint")} />
        <Toggle
          checked={consentRequired}
          onChange={setConsentRequired}
          label={t("store.tracking_consent_label")}
          hint={t("store.tracking_consent_hint")}
        />

        <div className="space-y-2.5">
          <div>
            <label className="text-xs font-semibold text-foreground">{t("store.tracking_event_label")}</label>
            <p className="mt-0.5 text-xs text-muted-foreground">{t("store.tracking_event_description")}</p>
          </div>
          <ConversionEventPicker value={conversionEvent} onChange={setConversionEvent} />
        </div>

        <ProviderBlock title={t("store.tracking_meta_title")} note={t("store.tracking_server_side_note")}>
          <FieldRow label={t("store.tracking_ad_account_label")} hint={t("store.tracking_ad_account_hint")}>
            <Input dir="ltr" value={fields.adAccountName} onChange={(e) => set("adAccountName")(e.currentTarget.value)} placeholder={t("store.tracking_ad_account_placeholder")} />
          </FieldRow>
          <FieldRow label={t("store.tracking_pixel_id_label")} hint={t("store.tracking_pixel_id_hint")}>
            <Input dir="ltr" value={fields.pixelId} onChange={(e) => set("pixelId")(e.currentTarget.value)} placeholder={t("store.tracking_pixel_id_placeholder")} />
          </FieldRow>
          <FieldRow label={t("store.tracking_token_label")} hint={t("store.tracking_token_hint")}>
            <SecretInput value={secrets.meta} onChange={setSecret("meta")} masked={masked.meta} placeholder={t("store.tracking_token_placeholder")} />
          </FieldRow>
          <Toggle checked={perPageTracking} onChange={setPerPageTracking} label={t("store.tracking_per_page_label")} hint={t("store.tracking_per_page_hint")} />
          {perPageTracking && (
            <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">{t("store.tracking_per_page_next_step")}</p>
          )}
          <FieldRow label={t("store.tracking_test_code_label")} hint={t("store.tracking_test_code_hint")}>
            <Input dir="ltr" value={fields.testEventCode} onChange={(e) => set("testEventCode")(e.currentTarget.value)} placeholder={t("store.tracking_test_code_placeholder")} />
          </FieldRow>
        </ProviderBlock>

        <ProviderBlock title={t("store.tracking_tiktok_title")} note={t("store.tracking_server_side_note")}>
          <FieldRow label={t("store.tracking_tiktok_pixel_label")} hint={t("store.tracking_tiktok_pixel_hint")}>
            <Input dir="ltr" value={fields.tiktokPixelId} onChange={(e) => set("tiktokPixelId")(e.currentTarget.value)} placeholder="C1A2B3C4D5E6F7G8H9I0" />
          </FieldRow>
          <FieldRow label={t("store.tracking_tiktok_token_label")} hint={t("store.tracking_secret_hint")}>
            <SecretInput value={secrets.tiktok} onChange={setSecret("tiktok")} masked={masked.tiktok} placeholder="••••••••" />
          </FieldRow>
          <FieldRow label={t("store.tracking_tiktok_test_code_label")} hint={t("store.tracking_tiktok_test_code_hint")}>
            <Input dir="ltr" value={fields.tiktokTestEventCode} onChange={(e) => set("tiktokTestEventCode")(e.currentTarget.value)} placeholder="TEST12345" />
          </FieldRow>
        </ProviderBlock>

        <ProviderBlock title={t("store.tracking_snap_title")} note={t("store.tracking_server_side_note")}>
          <FieldRow label={t("store.tracking_snap_pixel_label")} hint={t("store.tracking_snap_pixel_hint")}>
            <Input dir="ltr" value={fields.snapPixelId} onChange={(e) => set("snapPixelId")(e.currentTarget.value)} placeholder="1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d" />
          </FieldRow>
          <FieldRow label={t("store.tracking_snap_token_label")} hint={t("store.tracking_secret_hint")}>
            <SecretInput value={secrets.snap} onChange={setSecret("snap")} masked={masked.snap} placeholder="••••••••" />
          </FieldRow>
        </ProviderBlock>

        <ProviderBlock title={t("store.tracking_ga4_title")} note={t("store.tracking_server_side_note")}>
          <FieldRow label={t("store.tracking_ga4_id_label")} hint={t("store.tracking_ga4_id_hint")}>
            <Input dir="ltr" value={fields.ga4MeasurementId} onChange={(e) => set("ga4MeasurementId")(e.currentTarget.value)} placeholder="G-XXXXXXXXXX" />
          </FieldRow>
          <FieldRow label={t("store.tracking_ga4_secret_label")} hint={t("store.tracking_ga4_secret_hint")}>
            <SecretInput value={secrets.ga4} onChange={setSecret("ga4")} masked={masked.ga4} placeholder="••••••••" />
          </FieldRow>
        </ProviderBlock>

        <ProviderBlock title={t("store.tracking_gads_title")} note={t("store.tracking_browser_only_note")}>
          <FieldRow label={t("store.tracking_gads_id_label")} hint={t("store.tracking_gads_id_hint")}>
            <Input dir="ltr" value={fields.googleAdsId} onChange={(e) => set("googleAdsId")(e.currentTarget.value)} placeholder="AW-1234567890" />
          </FieldRow>
          <FieldRow label={t("store.tracking_gads_label_label")} hint={t("store.tracking_gads_label_hint")}>
            <Input dir="ltr" value={fields.googleAdsLabel} onChange={(e) => set("googleAdsLabel")(e.currentTarget.value)} placeholder="AbC-D_efG123" />
          </FieldRow>
        </ProviderBlock>

        <Toggle checked={testMode} onChange={setTestMode} label={t("store.tracking_test_mode_label")} hint={t("store.tracking_test_mode_hint")} />
        {testMode && (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-600">
            {t("store.tracking_test_mode_warning")}
          </p>
        )}

        {lastSaved && (
          <p className="text-xs text-muted-foreground">
            {t("store.tracking_last_saved")}: {new Date(lastSaved).toLocaleString()}
          </p>
        )}
      </SettingsSection>

      <TrackingDiagnostics refreshKey={savedVersion} />
    </div>
  );
}
