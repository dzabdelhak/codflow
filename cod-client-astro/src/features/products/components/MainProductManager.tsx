import { useEffect, useState } from "react";
import { Package, Repeat } from "lucide-react";
import { Alert, Badge, Button, Card, Dialog, SearchInput } from "@/components/ui";
import { canScope, useIdentity } from "@/features/auth/components/RequireAuth";
import { useLocale, useT } from "@/i18n/react";
import { notify } from "@/lib/notify";
import {
  getLandingChannel,
  listAllProducts,
  replaceMainProduct,
  setUnavailableRule,
  type LandingChannel,
} from "@/features/products/api";
import { catalogueCandidates, formatMoneyValue } from "@/features/products/model";
import type { Product } from "@/features/products/types";
import { UNAVAILABLE_RULES, type UnavailableRule } from "../../../../../cod-shared/channels/types";

function ReplaceDialog({
  currentId,
  onClose,
  onReplaced,
}: {
  currentId: string | null;
  onClose: () => void;
  onReplaced: (landing: LandingChannel) => void;
}) {
  const t = useT("products");
  const common = useT("common");
  const locale = useLocale();
  const [catalogue, setCatalogue] = useState<Product[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    listAllProducts().then(
      (rows) => alive && setCatalogue(rows),
      () => alive && setFailed(true),
    );
    return () => {
      alive = false;
    };
  }, []);

  const candidates = catalogue
    ? catalogueCandidates(catalogue, query, { includeCarried: true }).filter((p) => p.id !== currentId)
    : [];

  async function confirm() {
    if (!picked || busy) return;
    setBusy(true);
    try {
      onReplaced(await replaceMainProduct(picked));
      notify.success(t("main_product.replaced"));
    } catch {
      notify.error(t("main_product.action_failed"));
      setBusy(false);
    }
  }

  return (
    <Dialog title={t("main_product.replace_title")} description={t("main_product.replace_hint")} onClose={onClose}>
      <div className="space-y-4">
        <SearchInput value={query} onChange={setQuery} placeholder={t("store_selection.add_search")} />
        {failed ? (
          <Alert role="alert" tone="critical">{t("error_load")}</Alert>
        ) : catalogue === null ? (
          <p className="text-sm text-muted-foreground">{t("store_selection.loading")}</p>
        ) : candidates.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("main_product.replace_empty")}</p>
        ) : (
          <ul className="max-h-80 divide-y divide-border overflow-y-auto rounded-lg border border-border">
            {candidates.map((product) => (
              <li key={product.id}>
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5">
                  <input
                    type="radio"
                    name="main-product"
                    checked={picked === product.id}
                    onChange={() => setPicked(product.id)}
                    className="size-4 accent-primary"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{product.name}</span>
                    {product.sku && <span className="block text-xs text-muted-foreground" dir="ltr">{product.sku}</span>}
                  </span>
                  <span className="text-sm tabular-nums text-muted-foreground">{formatMoneyValue(product.price, locale)}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-3">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose} disabled={busy}>
            {common("cancel")}
          </Button>
          <Button type="button" className="flex-1" onClick={() => void confirm()} disabled={busy || !picked}>
            {t("main_product.replace_confirm")}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

export function MainProductManager() {
  const t = useT("products");
  const locale = useLocale();
  const identity = useIdentity();
  const canEdit = canScope(identity, "products:update");
  const [landing, setLanding] = useState<LandingChannel | null>(null);
  const [failed, setFailed] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [savingRule, setSavingRule] = useState(false);

  useEffect(() => {
    getLandingChannel().then(setLanding, () => setFailed(true));
  }, []);

  async function chooseRule(rule: UnavailableRule) {
    if (!landing || savingRule || rule === landing.unavailableRule) return;
    setSavingRule(true);
    try {
      setLanding(await setUnavailableRule(rule));
      notify.success(t("main_product.rule_saved"));
    } catch {
      notify.error(t("main_product.action_failed"));
    } finally {
      setSavingRule(false);
    }
  }

  if (failed) return <Alert role="alert" tone="critical">{t("error_load")}</Alert>;
  if (!landing) return <p className="text-sm text-muted-foreground">{t("store_selection.loading")}</p>;

  const product = landing.mainProduct;
  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center gap-4">
          {product?.primaryImageSrc ? (
            <img src={product.primaryImageSrc} alt="" className="size-16 rounded-lg border border-border object-cover" />
          ) : (
            <div className="flex size-16 items-center justify-center rounded-lg border border-border bg-muted">
              <Package size={20} className="text-muted-foreground" aria-hidden="true" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            {product ? (
              <>
                <p className="truncate font-bold">{product.name}</p>
                <p className="text-sm tabular-nums text-muted-foreground">{formatMoneyValue(product.price, locale)}</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{t("main_product.none")}</p>
            )}
          </div>
          <Badge tone={landing.available ? "success" : "warning"}>
            {t(landing.available ? "main_product.available" : "main_product.unavailable")}
          </Badge>
        </div>
        {!landing.available && product && <p className="mt-3 text-sm text-muted-foreground">{t("main_product.unavailable_hint")}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          {product && !product.deleted && (
            <a href={`/products/${encodeURIComponent(product.productId)}`} className="text-sm font-semibold text-brand underline">
              {t("main_product.edit_product")}
            </a>
          )}
          {canEdit && (
            <Button type="button" variant="secondary" onClick={() => setReplacing(true)}>
              <Repeat size={16} aria-hidden="true" />
              {t("main_product.replace")}
            </Button>
          )}
        </div>
      </Card>

      <Card>
        <fieldset className="space-y-2" disabled={!canEdit || savingRule}>
          <legend className="text-sm font-semibold">{t("main_product.rule_title")}</legend>
          <p className="text-xs text-muted-foreground">{t("main_product.rule_hint")}</p>
          {UNAVAILABLE_RULES.map((rule) => (
            <label key={rule} className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3">
              <input
                type="radio"
                name="unavailable-rule"
                checked={landing.unavailableRule === rule}
                onChange={() => void chooseRule(rule)}
                className="mt-0.5 size-4 accent-primary"
              />
              <span>
                <span className="block text-sm font-semibold">{t(`main_product.rule.${rule}.name`)}</span>
                <span className="block text-xs text-muted-foreground">{t(`main_product.rule.${rule}.description`)}</span>
              </span>
            </label>
          ))}
        </fieldset>
      </Card>

      {replacing && (
        <ReplaceDialog
          currentId={product?.productId ?? null}
          onClose={() => setReplacing(false)}
          onReplaced={(next) => {
            setLanding(next);
            setReplacing(false);
          }}
        />
      )}
    </div>
  );
}
