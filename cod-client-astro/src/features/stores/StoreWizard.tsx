import { useEffect, useState } from "react";
import { Check, CheckCircle2, LayoutTemplate, Package, Store, Truck } from "lucide-react";
import { Alert, Badge, Button, Card, Field, Input, SearchInput, Select } from "@/components/ui";
import { useLocale, useT } from "@/i18n/react";
import { ApiError } from "@/lib/api";
import { setActiveStoreId } from "@/lib/active-store";
import { listAllProducts } from "@/features/products/api";
import { formatMoneyValue } from "@/features/products/model";
import type { Product } from "@/features/products/types";
import { listShippingProfiles } from "@/features/delivery/api";
import type { ShippingProfile } from "@/features/delivery/types";
import { CHANNEL_TEMPLATES } from "../../../../cod-shared/channels/templates";
import { AVAILABLE_CHANNEL_TYPES, CHANNEL_TYPES, type ChannelType } from "../../../../cod-shared/channels/types";
import { createStore } from "./api";
import { baseDomainOf, suggestSubdomain, type MerchantStore } from "./store-choice";
import { useMerchantStores } from "./useMerchantStores";
import {
  WIZARD_STEPS,
  clearDraft,
  creationRequest,
  loadDraft,
  newDraft,
  nextStep,
  previousStep,
  saveDraft,
  stepForError,
  stepProblem,
  type WizardDraft,
  type WizardStep,
} from "./wizard-model";

function errorMessage(cause: unknown, t: (key: string) => string): string {
  if (!(cause instanceof ApiError)) return t("stores.wizard.error_network");
  switch (cause.code) {
    case "STORE_LIMIT_REACHED":
      return t("stores.error_limit")
        .replace("{used}", String(cause.context?.used ?? ""))
        .replace("{limit}", String(cause.context?.limit ?? ""));
    case "SUBDOMAIN_TAKEN":
      return t("stores.error_taken");
    case "INVALID_SUBDOMAIN":
      return t("stores.error_invalid");
    default:
      return t("stores.error_generic");
  }
}

function StepList({ current }: { current: WizardStep }) {
  const t = useT("navigation");
  const index = WIZARD_STEPS.indexOf(current);
  return (
    <ol className="flex flex-wrap gap-2">
      {WIZARD_STEPS.map((step, i) => (
        <li
          key={step}
          className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${
            i === index ? "border-brand bg-brand/10 text-brand" : i < index ? "border-border text-foreground" : "border-border text-muted-foreground"
          }`}
        >
          {i < index ? <Check size={12} aria-hidden="true" /> : <span className="tabular-nums">{i + 1}</span>}
          {t(`stores.wizard.step.${step}`)}
        </li>
      ))}
    </ol>
  );
}

export function StoreWizard() {
  const t = useT("navigation");
  const locale = useLocale();
  const { stores } = useMerchantStores();
  const [draft, setDraft] = useState<WizardDraft>(() => loadDraft() ?? newDraft());
  const [problem, setProblem] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<MerchantStore | null>(null);
  const [catalogue, setCatalogue] = useState<Product[] | null>(null);
  const [profiles, setProfiles] = useState<ShippingProfile[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    saveDraft(draft);
  }, [draft]);

  useEffect(() => {
    listAllProducts().then(setCatalogue, () => setCatalogue([]));
    listShippingProfiles().then(setProfiles, () => setProfiles([]));
  }, []);

  const baseDomain = baseDomainOf(stores ?? []);
  const update = (changes: Partial<WizardDraft>) => setDraft((current) => ({ ...current, ...changes }));

  function goNext() {
    const found = stepProblem(draft, draft.step);
    if (found) {
      setProblem(t(`stores.wizard.problem.${found}`));
      return;
    }
    setProblem(null);
    update({ step: nextStep(draft.step) });
  }

  async function submit() {
    if (busy) return;
    setBusy(true);
    setSubmitError(null);
    try {
      const store = await createStore(creationRequest(draft));
      clearDraft();
      setCreated(store);
    } catch (cause) {
      setSubmitError(errorMessage(cause, t));
      if (cause instanceof ApiError) update({ step: stepForError(cause.code, cause.context?.field) });
    } finally {
      setBusy(false);
    }
  }

  function restart() {
    clearDraft();
    setDraft(newDraft());
    setSubmitError(null);
    setProblem(null);
  }

  if (created) {
    return (
      <Card>
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <CheckCircle2 size={40} className="text-success" aria-hidden="true" />
          <h2 className="text-lg font-bold">{t("stores.wizard.done_title").replace("{name}", created.name)}</h2>
          <p className="max-w-md text-sm text-muted-foreground">{t("stores.wizard.done_body")}</p>
          {created.hostname && (
            <p className="text-sm font-semibold" dir="ltr">
              {created.hostname}
            </p>
          )}
          <Button
            type="button"
            onClick={() => {
              setActiveStoreId(created.id);
              window.location.href = "/dashboard";
            }}
          >
            {t("stores.wizard.open_dashboard")}
          </Button>
        </div>
      </Card>
    );
  }

  const selected = new Set(draft.productIds);
  const needle = query.trim().toLocaleLowerCase();
  const visibleProducts = (catalogue ?? []).filter(
    (p) => !p.deletedAt && (!needle || p.name.toLocaleLowerCase().includes(needle) || (p.sku ?? "").toLocaleLowerCase().includes(needle)),
  );
  const accountDefault = profiles.find((p) => p.isDefault);
  const address = draft.subdomain && baseDomain ? `${draft.subdomain}.${baseDomain}` : null;

  return (
    <div className="space-y-4">
      <StepList current={draft.step} />
      {submitError && (
        <Alert role="alert" tone="critical">
          {submitError}
        </Alert>
      )}

      <Card>
        {draft.step === "type" && (
          <div className="grid gap-3 sm:grid-cols-2">
            {CHANNEL_TYPES.map((type: ChannelType) => {
              const available = AVAILABLE_CHANNEL_TYPES.includes(type);
              const active = draft.type === type;
              return (
                <button
                  key={type}
                  type="button"
                  disabled={!available}
                  onClick={() => update({ type })}
                  className={`rounded-xl border p-4 text-start transition-colors ${
                    active ? "border-brand bg-brand/5" : "border-border hover:bg-muted/50"
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 font-bold">
                      {type === "store" ? <Store size={18} aria-hidden="true" /> : <LayoutTemplate size={18} aria-hidden="true" />}
                      {t(`stores.wizard.type.${type}.name`)}
                    </span>
                    {!available && <Badge tone="neutral" size="sm">{t("stores.wizard.coming_soon")}</Badge>}
                  </span>
                  <span className="mt-2 block text-sm text-muted-foreground">{t(`stores.wizard.type.${type}.description`)}</span>
                  <span className="mt-2 block text-xs text-muted-foreground">{t(`stores.wizard.type.${type}.features`)}</span>
                </button>
              );
            })}
          </div>
        )}

        {draft.step === "general" && (
          <div className="space-y-4">
            <Field label={t("stores.name_label")}>
              <Input
                value={draft.name}
                maxLength={80}
                placeholder={t("stores.name_placeholder")}
                onChange={(event) => {
                  const name = event.currentTarget.value;
                  update(draft.subdomainEdited ? { name } : { name, subdomain: suggestSubdomain(name) });
                }}
              />
            </Field>
            <Field
              label={t("stores.subdomain_label")}
              hint={address ? t("stores.subdomain_hint").replace("{address}", address) : t("stores.subdomain_rule")}
            >
              <Input
                value={draft.subdomain}
                maxLength={40}
                dir="ltr"
                autoCapitalize="none"
                spellCheck={false}
                onChange={(event) => update({ subdomain: event.currentTarget.value.toLowerCase(), subdomainEdited: true })}
              />
            </Field>
            <p className="text-xs text-muted-foreground">{t("stores.wizard.id_note")}</p>
          </div>
        )}

        {draft.step === "products" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{t("stores.wizard.products_hint")}</p>
            <SearchInput value={query} onChange={setQuery} placeholder={t("stores.wizard.products_search")} />
            {catalogue === null ? (
              <p className="text-sm text-muted-foreground">{t("stores.loading")}</p>
            ) : visibleProducts.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("stores.wizard.products_empty")}</p>
            ) : (
              <ul className="max-h-96 divide-y divide-border overflow-y-auto rounded-lg border border-border">
                {visibleProducts.map((product) => (
                  <li key={product.id}>
                    <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={selected.has(product.id)}
                        onChange={() =>
                          update({
                            productIds: selected.has(product.id)
                              ? draft.productIds.filter((id) => id !== product.id)
                              : [...draft.productIds, product.id],
                          })
                        }
                        className="size-4 accent-primary"
                      />
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{product.name}</span>
                      <span className="text-sm tabular-nums text-muted-foreground">{formatMoneyValue(product.price, locale)}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-muted-foreground">
              {t("stores.wizard.products_selected").replace("{n}", String(draft.productIds.length))}
            </p>
          </div>
        )}

        {draft.step === "delivery" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{t("stores.wizard.delivery_hint")}</p>
            {(["home", "stopDesk"] as const).map((mode) => (
              <label key={mode} className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border border-border p-3">
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <Truck size={16} aria-hidden="true" />
                  {t(`stores.wizard.mode.${mode}`)}
                </span>
                <input
                  type="checkbox"
                  checked={draft.deliveryModes[mode]}
                  onChange={(event) => update({ deliveryModes: { ...draft.deliveryModes, [mode]: event.currentTarget.checked } })}
                  className="size-5 accent-primary"
                />
              </label>
            ))}
            {profiles.length > 0 && (
              <Field label={t("stores.wizard.profile_label")}>
                <Select
                  value={draft.defaultShippingProfileId ?? ""}
                  onChange={(event) => update({ defaultShippingProfileId: event.currentTarget.value || null })}
                >
                  <option value="">{t("stores.wizard.profile_account").replace("{name}", accountDefault?.name ?? "—")}</option>
                  {profiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </div>
        )}

        {draft.step === "template" && (
          <div className="grid gap-3 sm:grid-cols-2">
            {CHANNEL_TEMPLATES.filter((tpl) => tpl.type === draft.type).map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                onClick={() => update({ templateId: tpl.id })}
                className={`rounded-xl border p-4 text-start ${draft.templateId === tpl.id ? "border-brand bg-brand/5" : "border-border hover:bg-muted/50"}`}
              >
                <span className="font-bold">{t(`stores.wizard.template.${tpl.id}.name`)}</span>
                <span className="mt-2 block text-sm text-muted-foreground">{t(`stores.wizard.template.${tpl.id}.description`)}</span>
              </button>
            ))}
          </div>
        )}

        {draft.step === "summary" && (
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">{t("stores.wizard.summary.type")}</dt>
              <dd className="font-semibold">{t(`stores.wizard.type.${draft.type}.name`)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t("stores.wizard.summary.name")}</dt>
              <dd className="font-semibold">{draft.name}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t("stores.wizard.summary.domain")}</dt>
              <dd className="font-semibold" dir="ltr">
                {address ?? draft.subdomain}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t("stores.wizard.summary.products")}</dt>
              <dd className="flex items-center gap-1.5 font-semibold">
                <Package size={14} aria-hidden="true" />
                {t("stores.wizard.products_selected").replace("{n}", String(draft.productIds.length))}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t("stores.wizard.summary.delivery")}</dt>
              <dd className="font-semibold">
                {(["home", "stopDesk"] as const)
                  .filter((mode) => draft.deliveryModes[mode])
                  .map((mode) => t(`stores.wizard.mode.${mode}`))
                  .join(" · ")}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t("stores.wizard.summary.template")}</dt>
              <dd className="font-semibold">{t(`stores.wizard.template.${draft.templateId}.name`)}</dd>
            </div>
          </dl>
        )}

        {problem && (
          <p role="alert" className="mt-4 text-sm font-medium text-destructive">
            {problem}
          </p>
        )}
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="secondary" onClick={restart} disabled={busy}>
          {t("stores.wizard.restart")}
        </Button>
        <div className="flex gap-2">
          {draft.step !== "type" && (
            <Button type="button" variant="secondary" onClick={() => update({ step: previousStep(draft.step) })} disabled={busy}>
              {t("stores.wizard.back")}
            </Button>
          )}
          {draft.step === "summary" ? (
            <Button type="button" onClick={() => void submit()} disabled={busy} aria-busy={busy}>
              {busy ? t("stores.creating") : t("stores.wizard.create")}
            </Button>
          ) : (
            <Button type="button" onClick={goNext}>
              {t("stores.wizard.next")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
