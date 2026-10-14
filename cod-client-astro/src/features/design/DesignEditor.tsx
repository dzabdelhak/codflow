import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ExternalLink, Monitor, Pencil, RefreshCw, Smartphone } from "lucide-react";
import { Alert, Badge, Button, Card, Field, IconButton, Input, Select, Textarea, useConfirmDialog } from "@/components/ui";
import { ColorField } from "@/features/settings/components/SettingsSection";
import { ImageField } from "./ImageField";
import { useLocale, useT } from "@/i18n/react";
import { ApiError } from "@/lib/api";
import { notify } from "@/lib/notify";
import { DESIGN_LOCALES, type DesignLocale } from "../../../../cod-shared/channels/manifests";
import { CURRENT_FONT, type DesignDocument, type DesignError } from "../../../../cod-shared/channels/design";
import {
  designPreviewLink,
  discardDesignDraft,
  getDesign,
  publishDesign,
  restoreDesignVersion,
  saveDesignDraft,
  type DesignState,
} from "./api";
import {
  moveSection,
  previewUrl,
  sameDocument,
  sectionSpec,
  setBrand,
  setSectionShown,
  setSettingLink,
  setSettingText,
  settingLink,
  settingText,
} from "./model";

const DESKTOP_WIDTH = 1280;
const MOBILE_WIDTH = 390;
const PREVIEW_HEIGHT = 760;

function designErrors(cause: unknown): DesignError[] | null {
  if (!(cause instanceof ApiError)) return null;
  const errors = cause.context?.errors;
  return Array.isArray(errors) ? (errors as DesignError[]) : null;
}

function Preview({ url, onRefresh }: { url: string | null; onRefresh: () => void }) {
  const t = useT("design");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const frame = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(0);

  useEffect(() => {
    const node = frame.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setAvailable(entry.contentRect.width));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const width = device === "desktop" ? DESKTOP_WIDTH : MOBILE_WIDTH;
  const scale = available > 0 ? Math.min(1, available / width) : 1;

  return (
    <Card
      title={t("preview")}
      action={
        <div className="flex items-center gap-1">
          <IconButton
            type="button"
            aria-label={t("preview_desktop")}
            title={t("preview_desktop")}
            onClick={() => setDevice("desktop")}
            className={device === "desktop" ? "bg-muted" : ""}
          >
            <Monitor size={16} />
          </IconButton>
          <IconButton type="button" aria-label={t("preview_mobile")} title={t("preview_mobile")} onClick={() => setDevice("mobile")} className={device === "mobile" ? "bg-muted" : ""}>
            <Smartphone size={16} />
          </IconButton>
          <IconButton type="button" aria-label={t("preview_refresh")} title={t("preview_refresh")} onClick={onRefresh}>
            <RefreshCw size={16} />
          </IconButton>
          {url && (
            <a href={url} target="_blank" rel="noreferrer" className="inline-flex size-9 items-center justify-center rounded-lg hover:bg-muted" aria-label={t("preview_open")}>
              <ExternalLink size={16} />
            </a>
          )}
        </div>
      }
    >
      <div className="space-y-3 p-4">
        <p className="text-xs text-muted-foreground">{t("preview_hint")}</p>
        <div ref={frame} className="relative overflow-hidden rounded-lg border border-border bg-muted" style={{ height: PREVIEW_HEIGHT * scale }}>
          {url && (
            <iframe
              key={`${url}-${device}`}
              title={t("preview")}
              src={url}
              className="absolute top-0 border-0 bg-background"
              style={{
                width,
                height: PREVIEW_HEIGHT,
                left: available > width * scale ? (available - width * scale) / 2 : 0,
                transform: `scale(${scale})`,
                transformOrigin: "top left",
              }}
            />
          )}
        </div>
      </div>
    </Card>
  );
}

export function DesignEditor() {
  const t = useT("design");
  const uiLocale = useLocale();
  const confirm = useConfirmDialog();
  const [state, setState] = useState<DesignState | null>(null);
  const [failed, setFailed] = useState(false);
  const [design, setDesign] = useState<DesignDocument | null>(null);
  const [locale, setLocale] = useState<DesignLocale>(uiLocale as DesignLocale);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<"save" | "publish" | "discard" | "restore" | null>(null);
  const [errors, setErrors] = useState<DesignError[] | null>(null);
  const [preview, setPreview] = useState<{ url: string; nonce: number } | null>(null);

  function apply(next: DesignState) {
    setState(next);
    setDesign(next.current);
    setErrors(null);
  }

  async function refreshPreview() {
    try {
      const link = await designPreviewLink();
      setPreview({ url: previewUrl(window.location, link.hostname, link.token), nonce: Date.now() });
    } catch {
      notify.error(t("preview_failed"));
    }
  }

  useEffect(() => {
    getDesign().then(apply, () => setFailed(true));
    void refreshPreview();
  }, []);

  const dirty = !!state && !!design && !sameDocument(design, state.current);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function run(kind: NonNullable<typeof busy>, action: () => Promise<DesignState>, success: (next: DesignState) => string) {
    setBusy(kind);
    try {
      const next = await action();
      apply(next);
      notify.success(success(next));
      void refreshPreview();
    } catch (cause) {
      const found = designErrors(cause);
      if (found) setErrors(found);
      else if (cause instanceof ApiError && cause.code === "DESIGN_NOTHING_TO_PUBLISH") notify.error(t("nothing_to_publish"));
      else notify.error(t("action_failed"));
    } finally {
      setBusy(null);
    }
  }

  if (failed) return <Alert role="alert" tone="critical">{t("load_failed")}</Alert>;
  if (!state || !design) return <p className="text-sm text-muted-foreground" role="status">…</p>;

  const { manifest } = state;
  const status = dirty ? t("unsaved") : state.draft ? t("draft_saved_status") : state.published ? t("up_to_date") : t("never_published");

  async function save() {
    await run("save", () => saveDesignDraft(design!), () => t("saved"));
  }

  async function publish() {
    if (!(await confirm({ title: t("publish_title"), description: t("publish_body"), confirmLabel: t("publish") }))) return;
    await run(
      "publish",
      async () => {
        if (dirty) await saveDesignDraft(design!);
        return publishDesign();
      },
      (next) => t("published").replace("{n}", String(next.published?.version ?? "")),
    );
  }

  async function discard() {
    if (!(await confirm({ title: t("discard_title"), description: t("discard_body"), confirmLabel: t("discard"), tone: "danger" }))) return;
    await run("discard", discardDesignDraft, () => t("discarded"));
  }

  async function restore(version: number) {
    if (
      dirty &&
      !(await confirm({
        title: t("restore_title"),
        description: t("restore_body").replace("{n}", String(version)),
        confirmLabel: t("restore_confirm"),
        tone: "danger",
      }))
    ) {
      return;
    }
    await run("restore", () => restoreDesignVersion(version), () => t("restored").replace("{n}", String(version)));
  }

  const canPublish = dirty || !!state.draft || !state.published;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Badge tone={dirty ? "warning" : state.draft ? "info" : state.published ? "success" : "neutral"}>{status}</Badge>
        <div className="flex flex-wrap gap-2">
          {(state.draft || dirty) && (
            <Button type="button" variant="secondary" onClick={() => void discard()} disabled={!!busy}>
              {t("discard")}
            </Button>
          )}
          <Button type="button" variant="secondary" onClick={() => void save()} disabled={!!busy || !dirty} aria-busy={busy === "save"}>
            {busy === "save" ? t("saving") : t("save_draft")}
          </Button>
          <Button type="button" onClick={() => void publish()} disabled={!!busy || !canPublish} aria-busy={busy === "publish"}>
            {busy === "publish" ? t("publishing") : t("publish")}
          </Button>
        </div>
      </div>

      {errors && (
        <Alert role="alert" tone="critical">
          <div>
            <p className="font-semibold">{t("invalid")}</p>
            <ul className="mt-1 list-disc ps-5 text-xs">
              {errors.map((error) => (
                <li key={`${error.path}-${error.message}`} dir="ltr">
                  {error.path}: {error.message}
                </li>
              ))}
            </ul>
          </div>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card title={t("brand_title")}>
            <div className="space-y-4 p-4">
              <Field label={t("logo_label")} hint={t("logo_hint")}>
                <ImageField
                  value={design.brand.logoUrl ?? ""}
                  placeholder={t("image_placeholder")}
                  onChange={(logoUrl) => setDesign(setBrand(design, { logoUrl: logoUrl || null }))}
                />
              </Field>
              <ColorField label={t("primary_label")} hint={t("primary_hint")} value={design.brand.primaryColor} onChange={(primaryColor) => setDesign(setBrand(design, { primaryColor }))} />
              <ColorField label={t("accent_label")} hint={t("accent_hint")} value={design.brand.accentColor} onChange={(accentColor) => setDesign(setBrand(design, { accentColor }))} />
              <ColorField label={t("bg_label")} hint={t("bg_hint")} value={design.brand.bgColor} onChange={(bgColor) => setDesign(setBrand(design, { bgColor }))} />
              <Field label={t("font_label")}>
                <Select value={design.brand.fontId} onChange={(event) => setDesign(setBrand(design, { fontId: event.currentTarget.value }))}>
                  {design.brand.fontId === CURRENT_FONT && <option value={CURRENT_FONT}>{t("font_current")}</option>}
                  {manifest.brand.fonts.map((font) => (
                    <option key={font.id} value={font.id}>
                      {font.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </Card>

          <Card
            title={t("sections_title")}
            subtitle={t("sections_hint")}
            action={
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                {t("texts_in")}
                <Select value={locale} onChange={(event) => setLocale(event.currentTarget.value as DesignLocale)}>
                  {DESIGN_LOCALES.map((code) => (
                    <option key={code} value={code}>
                      {t(`language.${code}`)}
                    </option>
                  ))}
                </Select>
              </label>
            }
          >
            <ol className="divide-y divide-border">
              {design.sections.map((section, index) => {
                const spec = sectionSpec(manifest, section.type);
                if (!spec) return null;
                const editing = open === section.id;
                return (
                  <li key={section.id} className="p-3">
                    <div className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <p className={`truncate text-sm font-semibold ${section.enabled ? "" : "text-muted-foreground line-through"}`}>
                          {t(`section.${section.type}`)}
                        </p>
                        {spec.essential && <Badge tone="brand" size="sm">{t("essential")}</Badge>}
                      </div>
                      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <input
                          type="checkbox"
                          checked={section.enabled}
                          disabled={spec.essential}
                          onChange={(event) => setDesign(setSectionShown(design, manifest, section.id, event.currentTarget.checked))}
                          className="size-4 accent-primary"
                        />
                        {section.enabled ? t("shown") : t("hidden")}
                      </label>
                      <IconButton type="button" aria-label={t("move_up")} title={t("move_up")} onClick={() => setDesign(moveSection(design, index, -1))} disabled={index === 0}>
                        <ArrowUp size={14} />
                      </IconButton>
                      <IconButton
                        type="button"
                        aria-label={t("move_down")}
                        title={t("move_down")}
                        onClick={() => setDesign(moveSection(design, index, 1))}
                        disabled={index === design.sections.length - 1}
                      >
                        <ArrowDown size={14} />
                      </IconButton>
                      <IconButton type="button" aria-label={editing ? t("close") : t("edit")} title={editing ? t("close") : t("edit")} onClick={() => setOpen(editing ? null : section.id)}>
                        <Pencil size={14} />
                      </IconButton>
                    </div>
                    {editing && (
                      <div className="mt-3 space-y-3">
                        {spec.settings.length === 0 && <p className="text-xs text-muted-foreground">{t("no_settings")}</p>}
                        {spec.settings.map((setting) => (
                          <Field key={setting.key} label={t(`setting.${setting.key}`)}>
                            {setting.kind === "textarea" ? (
                              <Textarea
                                dir={locale === "ar" ? "rtl" : "ltr"}
                                rows={3}
                                value={settingText(section, setting.key, locale)}
                                placeholder={t("default_placeholder")}
                                onChange={(event) => setDesign(setSettingText(design, section.id, setting.key, locale, event.currentTarget.value))}
                              />
                            ) : setting.kind === "text" ? (
                              <Input
                                dir={locale === "ar" ? "rtl" : "ltr"}
                                value={settingText(section, setting.key, locale)}
                                placeholder={t("default_placeholder")}
                                onChange={(event) => setDesign(setSettingText(design, section.id, setting.key, locale, event.currentTarget.value))}
                              />
                            ) : setting.kind === "image" ? (
                              <ImageField
                                value={settingLink(section, setting.key)}
                                placeholder={t("image_placeholder")}
                                onChange={(url) => setDesign(setSettingLink(design, section.id, setting.key, url))}
                              />
                            ) : (
                              <Input
                                dir="ltr"
                                value={settingLink(section, setting.key)}
                                placeholder={t("link_placeholder")}
                                onChange={(event) => setDesign(setSettingLink(design, section.id, setting.key, event.currentTarget.value))}
                              />
                            )}
                          </Field>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          </Card>

          <Card title={t("versions_title")}>
            {state.versions.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">{t("versions_empty")}</p>
            ) : (
              <ul className="divide-y divide-border">
                {state.versions.map((version) => (
                  <li key={version.version} className="flex items-center justify-between gap-3 p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">
                        {t("version_label").replace("{n}", String(version.version))}{" "}
                        {version.version === state.published?.version && <Badge tone="success" size="sm">{t("current_version")}</Badge>}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t("version_meta")
                          .replace("{date}", new Date(version.publishedAt).toLocaleString(uiLocale))
                          .replace("{by}", version.publishedBy ?? "—")}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={!!busy}
                      onClick={() => void restore(version.version)}
                    >
                      {t("restore")}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="xl:sticky xl:top-4 xl:self-start">
          <Preview url={preview ? `${preview.url}&v=${preview.nonce}` : null} onRefresh={() => void refreshPreview()} />
        </div>
      </div>
    </div>
  );
}
