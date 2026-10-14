import { useEffect, useState, type FormEvent } from "react";
import { Ban, Trash2 } from "lucide-react";
import { RequireAuth, canScope, useIdentity } from "@/features/auth/components/RequireAuth";
import { DashboardChrome } from "@/components/layout/chrome";
import { Alert, Badge, Button, Card, IconButton, Input, PageHeader, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, useConfirmDialog } from "@/components/ui";
import { useLocale, useT } from "@/i18n/react";
import { ApiError } from "@/lib/api";
import { notify } from "@/lib/notify";
import { SCOPES } from "../../../../cod-shared/rbac/scopes";
import { blockPhone, getBlockedAttempts, getBlockedPhones, unblockPhone, type BlockedAttempt, type BlockedPhone } from "./api";

const REASON_TONE = { blocked_phone: "critical", phone_window: "warning", device_window: "warning", ip_ceiling: "info", ip_flagged: "neutral" } as const;

function OrderProtection() {
  const t = useT("order-protection");
  const auth = useT("auth");
  const locale = useLocale();
  const identity = useIdentity();
  const confirm = useConfirmDialog();
  const canRead = canScope(identity, SCOPES.ORDERS_READ);
  const canManage = canScope(identity, SCOPES.ORDERS_UPDATE);
  const [attempts, setAttempts] = useState<BlockedAttempt[] | null>(null);
  const [phones, setPhones] = useState<BlockedPhone[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!canRead) return;
    Promise.all([getBlockedAttempts(), getBlockedPhones()]).then(
      ([a, p]) => {
        setAttempts(a);
        setPhones(p);
      },
      () => setFailed(true),
    );
  }, [canRead]);

  const blocked = new Set((phones ?? []).map((p) => p.phone));

  async function block(value: string, withNote?: string) {
    setBusy(true);
    try {
      setPhones(await blockPhone(value, withNote));
      notify.success(t("blocked_done"));
      return true;
    } catch (cause) {
      notify.error(t(cause instanceof ApiError && cause.code === "INVALID_PHONE_FORMAT" ? "error_phone" : "error_generic"));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add(event: FormEvent) {
    event.preventDefault();
    if (!phone.trim()) return;
    if (await block(phone.trim(), note.trim())) {
      setPhone("");
      setNote("");
    }
  }

  async function remove(entry: BlockedPhone) {
    if (!(await confirm({ title: t("unblock_title").replace("{phone}", entry.phone), description: t("unblock_body"), confirmLabel: t("unblock") }))) return;
    setBusy(true);
    try {
      setPhones(await unblockPhone(entry.id));
      notify.success(t("unblocked_done"));
    } catch {
      notify.error(t("error_generic"));
    } finally {
      setBusy(false);
    }
  }

  if (!canRead) return <Alert role="alert" tone="critical">{auth("no_access")}</Alert>;
  if (failed) return <Alert role="alert" tone="critical">{t("load_failed")}</Alert>;
  if (!attempts || !phones) return <p className="text-sm text-muted-foreground" role="status">…</p>;

  return (
    <div className="space-y-6">
      <Card title={t("attempts_title")} subtitle={t("attempts_subtitle")} flush>
        {attempts.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">{t("attempts_empty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("column_when")}</TableHead>
                  <TableHead>{t("column_reason")}</TableHead>
                  <TableHead>{t("column_customer")}</TableHead>
                  <TableHead>{t("column_order")}</TableHead>
                  <TableHead>{t("column_source")}</TableHead>
                  <TableHead>{t("column_actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {attempts.map((attempt) => (
                  <TableRow key={attempt.id}>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">{new Date(attempt.createdAt).toLocaleString(locale)}</span>
                    </TableCell>
                    <TableCell>
                      <Badge tone={REASON_TONE[attempt.reason]} size="sm">{t(`reason.${attempt.reason}`)}</Badge>
                    </TableCell>
                    <TableCell>
                      <p className="font-semibold">{attempt.customerName}</p>
                      <p className="font-mono text-xs" dir="ltr">{attempt.phone}</p>
                    </TableCell>
                    <TableCell>
                      <p className="text-xs">{attempt.details.lines.map((l) => `${l.quantity} × ${l.productName}`).join(", ")}</p>
                      <p className="font-mono text-[11px] text-muted-foreground" dir="ltr">{attempt.orderNumber}</p>
                    </TableCell>
                    <TableCell>
                      <p className="font-mono text-[11px] text-muted-foreground" dir="ltr">{attempt.ipAddress ?? "—"}</p>
                    </TableCell>
                    <TableCell>
                      {canManage && !blocked.has(attempt.phone) && (
                        <Button type="button" variant="dangerOutline" size="sm" disabled={busy} onClick={() => void block(attempt.phone)}>
                          <Ban size={14} aria-hidden="true" />
                          {t("block_phone")}
                        </Button>
                      )}
                      {blocked.has(attempt.phone) && <Badge tone="critical" size="sm">{t("phone_blocked")}</Badge>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <Card title={t("blocklist_title")} subtitle={t("blocklist_subtitle")}>
        <div className="space-y-4">
          {canManage && (
            <form onSubmit={(event) => void add(event)} className="flex flex-wrap items-start gap-2">
              <Input dir="ltr" className="max-w-56" value={phone} onChange={(e) => setPhone(e.currentTarget.value)} placeholder="0550 12 34 56" aria-label={t("phone_label")} />
              <Input className="min-w-48 flex-1" value={note} onChange={(e) => setNote(e.currentTarget.value)} placeholder={t("note_placeholder")} aria-label={t("note_label")} />
              <Button type="submit" disabled={busy || !phone.trim()}>
                <Ban size={16} aria-hidden="true" />
                {t("block_phone")}
              </Button>
            </form>
          )}
          {phones.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("blocklist_empty")}</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {phones.map((entry) => (
                <li key={entry.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div>
                    <p className="font-mono text-sm font-semibold" dir="ltr">{entry.phone}</p>
                    <p className="text-xs text-muted-foreground">
                      {[entry.note, entry.createdBy, new Date(entry.createdAt).toLocaleDateString(locale)].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  {canManage && (
                    <IconButton type="button" variant="danger" aria-label={t("unblock")} title={t("unblock")} disabled={busy} onClick={() => void remove(entry)}>
                      <Trash2 size={15} />
                    </IconButton>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
}

function Page() {
  const t = useT("order-protection");
  return (
    <DashboardChrome currentPath="/orders/blocked">
      <PageHeader title={t("page_title")} subtitle={t("page_subtitle")} />
      <OrderProtection />
    </DashboardChrome>
  );
}

export default function OrderProtectionPageApp() {
  return (
    <RequireAuth>
      <Page />
    </RequireAuth>
  );
}
