import { useEffect, useState, type FormEvent } from "react";
import { AlertCircle, ArrowRight, History, MoreHorizontal, Store, Trash2 } from "lucide-react";
import {
  Alert,
  Badge,
  Button,
  Dialog,
  DropdownItem,
  DropdownMenu,
  EmptyState,
  Field,
  Input,
  SearchInput,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  useConfirmDialog,
} from "@/components/ui";
import { useIdentity } from "@/features/auth/components/RequireAuth";
import { useLocale, useT } from "@/i18n/react";
import { ApiError } from "@/lib/api";
import { activeStoreId } from "@/lib/active-store";
import { notify } from "@/lib/notify";
import { CHANNEL_STATUSES, nextStatuses, type ChannelStatus } from "../../../../cod-shared/channels/lifecycle";
import { changeStoreStatus, deleteStore, listMyStores, listStatusHistory, type StatusChange } from "./api";
import { canDeleteStore, filterStores, pickActiveStore, type MerchantStore } from "./store-choice";
import { refreshMerchantStores, switchToStore } from "./useMerchantStores";
import { StoreStatusBadge } from "./StoreStatusBadge";

const CONFIRMED_MOVES: ReadonlySet<ChannelStatus> = new Set(["published", "suspended", "archived"]);

function formatDate(value: string, locale: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "-"
    : new Intl.DateTimeFormat(locale === "ar" ? "ar-DZ" : `${locale}-DZ`, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function HistoryDialog({ store, onClose }: { store: MerchantStore; onClose: () => void }) {
  const t = useT("navigation");
  const locale = useLocale();
  const [changes, setChanges] = useState<StatusChange[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    listStatusHistory(store.id).then(
      (rows) => alive && setChanges(rows),
      () => alive && setFailed(true),
    );
    return () => {
      alive = false;
    };
  }, [store.id]);

  return (
    <Dialog title={t("stores.history_title")} description={store.name} onClose={onClose}>
      {failed ? (
        <Alert role="alert" tone="critical">{t("stores.history_failed")}</Alert>
      ) : changes === null ? (
        <p className="text-sm text-muted-foreground">{t("stores.loading")}</p>
      ) : changes.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("stores.history_empty")}</p>
      ) : (
        <ol className="space-y-3">
          {changes.map((change) => (
            <li key={change.id} className="rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <StoreStatusBadge status={change.from} />
                <ArrowRight size={14} aria-hidden="true" className="text-muted-foreground rtl:rotate-180" />
                <StoreStatusBadge status={change.to} />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {t("stores.history_by")
                  .replace("{name}", change.actorName)
                  .replace("{date}", formatDate(change.createdAt, locale))}
              </p>
            </li>
          ))}
        </ol>
      )}
    </Dialog>
  );
}

function DeleteDialog({
  store,
  onClose,
  onDeleted,
}: {
  store: MerchantStore;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const t = useT("navigation");
  const common = useT("common");
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || typed.trim() !== store.name) return;
    setBusy(true);
    setError(null);
    try {
      await deleteStore(store.id, typed);
      onDeleted();
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.code === "STORE_NOT_DELETABLE"
          ? t("stores.delete_refused")
          : t("stores.action_failed"),
      );
      setBusy(false);
    }
  }

  return (
    <Dialog title={t("stores.delete_title")} description={t("stores.delete_description")} onClose={onClose}>
      <form className="space-y-4" onSubmit={(event) => void submit(event)}>
        <Field label={t("stores.delete_confirm_label").replace("{name}", store.name)} error={error ?? undefined}>
          <Input value={typed} onChange={(event) => setTyped(event.currentTarget.value)} autoComplete="off" />
        </Field>
        <div className="flex gap-3">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose} disabled={busy}>
            {common("cancel")}
          </Button>
          <Button type="submit" variant="danger" className="flex-1" disabled={busy || typed.trim() !== store.name}>
            {t("stores.delete_submit")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function StoreManager() {
  const t = useT("navigation");
  const common = useT("common");
  const locale = useLocale();
  const identity = useIdentity();
  const confirm = useConfirmDialog();
  const [stores, setStores] = useState<MerchantStore[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<ChannelStatus | "all">("all");
  const [historyOf, setHistoryOf] = useState<MerchantStore | null>(null);
  const [deleting, setDeleting] = useState<MerchantStore | null>(null);
  const isAdmin = identity?.role === "admin";

  async function load() {
    setFailed(false);
    try {
      setStores(await listMyStores());
    } catch {
      setFailed(true);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function move(store: MerchantStore, to: ChannelStatus) {
    if (
      CONFIRMED_MOVES.has(to) &&
      !(await confirm({
        title: t(`stores.confirm_${to}_title`).replace("{name}", store.name),
        description: t(`stores.confirm_${to}_description`),
        confirmLabel: t(`stores.move.${to}`),
        tone: to === "published" ? "default" : "danger",
      }))
    )
      return;
    try {
      const updated = await changeStoreStatus(store.id, to);
      setStores((current) => current?.map((s) => (s.id === updated.id ? updated : s)) ?? null);
      refreshMerchantStores();
      notify.success(t("stores.status_changed"));
    } catch {
      notify.error(t("stores.action_failed"));
    }
  }

  if (failed)
    return (
      <Alert role="alert" tone="critical">
        <AlertCircle size={18} className="shrink-0" />
        <div className="flex-1">
          <p className="font-semibold">{t("stores.load_failed")}</p>
          <button type="button" onClick={() => void load()} className="mt-3 text-xs font-semibold underline underline-offset-4">
            {common("retry")}
          </button>
        </div>
      </Alert>
    );
  if (stores === null) return <p className="text-sm text-muted-foreground">{t("stores.loading")}</p>;

  const active = pickActiveStore(stores, activeStoreId());
  const visible = filterStores(stores, query, status);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <SearchInput value={query} onChange={setQuery} placeholder={t("stores.search_placeholder")} className="flex-1" />
        <Select
          value={status}
          onChange={(event) => setStatus(event.currentTarget.value as ChannelStatus | "all")}
          aria-label={t("stores.status_filter")}
          className="sm:w-56"
        >
          <option value="all">{t("stores.status_all")}</option>
          {CHANNEL_STATUSES.map((value) => (
            <option key={value} value={value}>
              {t(`stores.status.${value}`)}
            </option>
          ))}
        </Select>
      </div>

      {visible.length === 0 ? (
        <EmptyState icon={<Store size={22} />} title={t("stores.no_match")} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("stores.column_store")}</TableHead>
              <TableHead>{t("stores.column_status")}</TableHead>
              <TableHead className="hidden md:table-cell">{t("stores.column_created")}</TableHead>
              <TableHead className="text-end">{t("stores.column_actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((store) => (
              <TableRow key={store.id}>
                <TableCell>
                  <p className="flex items-center gap-2 font-semibold">
                    {store.name}
                    <Badge tone="neutral" size="sm">{t(`stores.wizard.type.${store.type}.name`)}</Badge>
                    {store.id === active?.id && <Badge tone="brand" size="sm">{t("stores.active")}</Badge>}
                  </p>
                  {store.hostname && (
                    <p className="text-xs text-muted-foreground" dir="ltr">
                      {store.hostname}
                    </p>
                  )}
                </TableCell>
                <TableCell>
                  <StoreStatusBadge status={store.status} />
                </TableCell>
                <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                  {formatDate(store.createdAt, locale)}
                </TableCell>
                <TableCell className="text-end">
                  <div className="flex items-center justify-end gap-2">
                    {store.id !== active?.id && (
                      <Button type="button" size="sm" variant="secondary" onClick={() => switchToStore(store.id)}>
                        {t("stores.open")}
                      </Button>
                    )}
                    <DropdownMenu
                      trigger={<MoreHorizontal size={16} aria-hidden="true" />}
                      triggerLabel={t("stores.actions_label").replace("{name}", store.name)}
                    >
                      {isAdmin &&
                        nextStatuses(store.status).map((to) => (
                          <DropdownItem key={to} onClick={() => void move(store, to)} danger={to === "archived"}>
                            {t(`stores.move.${to}`)}
                          </DropdownItem>
                        ))}
                      <DropdownItem onClick={() => setHistoryOf(store)}>
                        <History size={15} aria-hidden="true" className="shrink-0" />
                        {t("stores.history")}
                      </DropdownItem>
                      {isAdmin && canDeleteStore(store, stores) && (
                        <DropdownItem danger onClick={() => setDeleting(store)}>
                          <Trash2 size={15} aria-hidden="true" className="shrink-0" />
                          {t("stores.delete")}
                        </DropdownItem>
                      )}
                    </DropdownMenu>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {historyOf && <HistoryDialog store={historyOf} onClose={() => setHistoryOf(null)} />}
      {deleting && (
        <DeleteDialog
          store={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            notify.success(t("stores.deleted"));
            if (deleting.id === activeStoreId()) {
              switchToStore(stores.find((s) => s.id !== deleting.id)!.id);
              return;
            }
            setStores(stores.filter((s) => s.id !== deleting.id));
            refreshMerchantStores();
            setDeleting(null);
          }}
        />
      )}
    </div>
  );
}
