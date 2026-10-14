import { useEffect, useState } from "react";
import { AlertCircle, ArrowDown, ArrowUp, Package, Plus, Trash2 } from "lucide-react";
import {
  Alert,
  Badge,
  Button,
  Dialog,
  EmptyState,
  IconButton,
  SearchInput,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  useConfirmDialog,
} from "@/components/ui";
import { canScope, useIdentity } from "@/features/auth/components/RequireAuth";
import { useLocale, useT } from "@/i18n/react";
import { notify } from "@/lib/notify";
import {
  addStoreProducts,
  listAllProducts,
  listStoreProducts,
  removeStoreProduct,
  reorderStoreProducts,
  updateStoreProduct,
  type StoreProduct,
} from "@/features/products/api";
import { catalogueCandidates, formatMoneyValue, moveItem } from "@/features/products/model";
import type { Product } from "@/features/products/types";

function AddFromCatalogueDialog({ onClose, onAdded }: { onClose: () => void; onAdded: (rows: StoreProduct[]) => void }) {
  const t = useT("products");
  const common = useT("common");
  const locale = useLocale();
  const [catalogue, setCatalogue] = useState<Product[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
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

  const candidates = catalogue ? catalogueCandidates(catalogue, query) : [];

  function toggle(id: string) {
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function confirm() {
    if (picked.size === 0 || busy) return;
    setBusy(true);
    try {
      onAdded(await addStoreProducts([...picked]));
      notify.success(t("store_selection.added").replace("{n}", String(picked.size)));
    } catch {
      notify.error(t("store_selection.action_failed"));
      setBusy(false);
    }
  }

  return (
    <Dialog title={t("store_selection.add_title")} description={t("store_selection.add_description")} onClose={onClose}>
      <div className="space-y-4">
        <SearchInput value={query} onChange={setQuery} placeholder={t("store_selection.add_search")} />
        {failed ? (
          <Alert role="alert" tone="critical">{t("error_load")}</Alert>
        ) : catalogue === null ? (
          <p className="text-sm text-muted-foreground">{t("store_selection.loading")}</p>
        ) : candidates.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("store_selection.add_empty")}</p>
        ) : (
          <ul className="max-h-80 divide-y divide-border overflow-y-auto rounded-lg border border-border">
            {candidates.map((product) => (
              <li key={product.id}>
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={picked.has(product.id)}
                    onChange={() => toggle(product.id)}
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
          <Button type="button" className="flex-1" onClick={() => void confirm()} disabled={busy || picked.size === 0}>
            {t("store_selection.add_confirm").replace("{n}", String(picked.size))}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

export function StoreProductsManager() {
  const t = useT("products");
  const common = useT("common");
  const locale = useLocale();
  const identity = useIdentity();
  const confirm = useConfirmDialog();
  const [rows, setRows] = useState<StoreProduct[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const canEdit = canScope(identity, "products:update");

  async function load() {
    setFailed(false);
    try {
      setRows(await listStoreProducts());
    } catch {
      setFailed(true);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await action();
    } catch {
      notify.error(t("store_selection.action_failed"));
      await load();
    } finally {
      setBusy(false);
    }
  }

  function toggle(row: StoreProduct, field: "published" | "featured") {
    void run(async () => {
      const updated = await updateStoreProduct(row.productId, { [field]: !row[field] });
      setRows((current) => current?.map((r) => (r.productId === updated.productId ? updated : r)) ?? null);
    });
  }

  function move(index: number, delta: -1 | 1) {
    if (!rows) return;
    const next = moveItem(rows, index, delta);
    setRows(next);
    void run(async () => setRows(await reorderStoreProducts(next.map((r) => r.productId))));
  }

  async function remove(row: StoreProduct) {
    if (
      !(await confirm({
        title: t("store_selection.remove_title").replace("{name}", row.name),
        description: t("store_selection.remove_description"),
        confirmLabel: t("store_selection.remove"),
        tone: "danger",
      }))
    )
      return;
    void run(async () => {
      await removeStoreProduct(row.productId);
      setRows((current) => current?.filter((r) => r.productId !== row.productId) ?? null);
    });
  }

  if (failed)
    return (
      <Alert role="alert" tone="critical">
        <AlertCircle size={18} className="shrink-0" />
        <div className="flex-1">
          <p className="font-semibold">{t("error_load")}</p>
          <button type="button" onClick={() => void load()} className="mt-3 text-xs font-semibold underline underline-offset-4">
            {common("retry")}
          </button>
        </div>
      </Alert>
    );
  if (rows === null) return <p className="text-sm text-muted-foreground">{t("store_selection.loading")}</p>;

  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="flex justify-end">
          <Button type="button" onClick={() => setAdding(true)}>
            <Plus size={16} aria-hidden="true" />
            {t("store_selection.add")}
          </Button>
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState icon={<Package size={22} />} title={t("store_selection.empty")} description={t("store_selection.empty_hint")} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("store_selection.column_product")}</TableHead>
              <TableHead>{t("store_selection.column_price")}</TableHead>
              <TableHead>{t("store_selection.column_published")}</TableHead>
              <TableHead>{t("store_selection.column_featured")}</TableHead>
              {canEdit && <TableHead className="text-end">{t("store_selection.column_actions")}</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow key={row.productId}>
                <TableCell>
                  <a href={`/products/${encodeURIComponent(row.productId)}`} className="flex items-center gap-3">
                    {row.primaryImageSrc ? (
                      <img src={row.primaryImageSrc} alt="" className="size-10 shrink-0 rounded-lg object-cover" />
                    ) : (
                      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted">
                        <Package size={16} className="text-muted-foreground" aria-hidden="true" />
                      </span>
                    )}
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{row.name}</span>
                      {row.status !== "ACTIVE" && (
                        <Badge tone="neutral" size="sm">{t(`status_options.${row.status.toLowerCase()}`)}</Badge>
                      )}
                    </span>
                  </a>
                </TableCell>
                <TableCell className="text-sm tabular-nums">{formatMoneyValue(row.price, locale)}</TableCell>
                <TableCell>
                  <input
                    type="checkbox"
                    checked={row.published}
                    onChange={() => toggle(row, "published")}
                    disabled={!canEdit || busy}
                    aria-label={t("store_selection.column_published")}
                    className="size-5 accent-primary"
                  />
                </TableCell>
                <TableCell>
                  <input
                    type="checkbox"
                    checked={row.featured}
                    onChange={() => toggle(row, "featured")}
                    disabled={!canEdit || busy}
                    aria-label={t("store_selection.column_featured")}
                    className="size-5 accent-primary"
                  />
                </TableCell>
                {canEdit && (
                  <TableCell className="text-end">
                    <div className="flex items-center justify-end gap-1">
                      <IconButton
                        aria-label={t("store_selection.move_up")}
                        title={t("store_selection.move_up")}
                        onClick={() => move(index, -1)}
                        disabled={busy || index === 0}
                      >
                        <ArrowUp size={15} />
                      </IconButton>
                      <IconButton
                        aria-label={t("store_selection.move_down")}
                        title={t("store_selection.move_down")}
                        onClick={() => move(index, 1)}
                        disabled={busy || index === rows.length - 1}
                      >
                        <ArrowDown size={15} />
                      </IconButton>
                      <IconButton aria-label={t("store_selection.remove")} title={t("store_selection.remove")} variant="danger" onClick={() => void remove(row)} disabled={busy}>
                        <Trash2 size={15} />
                      </IconButton>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {adding && (
        <AddFromCatalogueDialog
          onClose={() => setAdding(false)}
          onAdded={(next) => {
            setRows(next);
            setAdding(false);
          }}
        />
      )}
    </div>
  );
}
