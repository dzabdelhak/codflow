import { useEffect, useState } from "react";
import { RefreshCw, Send } from "lucide-react";
import { RequireAuth, canScope, useIdentity } from "@/features/auth/components/RequireAuth";
import { DashboardChrome } from "@/components/layout/chrome";
import { Alert, Badge, Button, Card, PageHeader, StatCard, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui";
import { useLocale, useT } from "@/i18n/react";
import { notify } from "@/lib/notify";
import { SCOPES } from "../../../../cod-shared/rbac/scopes";
import { getTransmission, getTransmissionAlerts, resendOutbound, type OutboundEntry, type Transmission, type TransmissionAlerts } from "./api";

const STATE_TONE = { connected: "success", failing: "critical", idle: "neutral" } as const;

function Transmissions() {
  const t = useT("transmission");
  const auth = useT("auth");
  const locale = useLocale();
  const identity = useIdentity();
  const canRead = canScope(identity, SCOPES.ORDERS_READ);
  const canResend = canScope(identity, SCOPES.ORDERS_UPDATE);
  const [data, setData] = useState<Transmission | null>(null);
  const [aventyKey, setAventyKey] = useState<TransmissionAlerts["aventyKey"]>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const when = (value: string | null) => (value ? new Date(value).toLocaleString(locale) : "—");
  const load = () => getTransmission().then(setData, () => setFailed(true));

  useEffect(() => {
    if (!canRead) return;
    void load();
    getTransmissionAlerts().then((alerts) => setAventyKey(alerts.aventyKey), () => {});
  }, [canRead]);

  async function resend(entry: OutboundEntry) {
    setBusy(entry.sendId);
    try {
      setData(await resendOutbound(entry.sendId));
      notify.success(t("resent").replace("{order}", entry.orderNumber));
    } catch {
      notify.error(t("resend_failed"));
    } finally {
      setBusy(null);
    }
  }

  const problem = (entry: OutboundEntry) =>
    entry.outcomeDetail?.fields?.length
      ? t("fields_at_fault").replace("{fields}", entry.outcomeDetail.fields.join(", "))
      : entry.lastError ?? (entry.lastOutcome ? t(`outcome.${entry.lastOutcome}`) : "");

  if (!canRead) return <Alert role="alert" tone="critical">{auth("no_access")}</Alert>;
  if (failed) return <Alert role="alert" tone="critical">{t("load_failed")}</Alert>;
  if (!data) return <p className="text-sm text-muted-foreground" role="status">…</p>;

  return (
    <div className="space-y-6">
      {aventyKey && (
        <Alert role="alert" tone="critical">
          {t(`aventy_key_${aventyKey}_alert`)}
        </Alert>
      )}
      {data.counts.stale > 0 && (
        <Alert role="alert" tone="critical">
          {t("stale_alert").replace("{n}", String(data.counts.stale))}
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <p className="text-xs font-semibold text-muted-foreground">{t("connection")}</p>
          <div className="mt-2 flex items-center gap-2">
            <Badge tone={STATE_TONE[data.connection.state]}>{t(`state.${data.connection.state}`)}</Badge>
            <span className="text-xs text-muted-foreground">{t("destination").replace("{name}", data.destination)}</span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{t("last_attempt").replace("{date}", when(data.connection.lastAttemptAt))}</p>
        </Card>
        <StatCard label={t("last_success")} value={when(data.lastSuccessAt)} />
        <StatCard label={t("waiting")} value={String(data.counts.waiting)} />
        <StatCard label={t("sent_rejected")} value={`${data.counts.sent} / ${data.counts.rejected}`} />
      </div>

      <Card
        title={t("rejected_title")}
        subtitle={t("rejected_subtitle")}
        flush
        action={
          <Button type="button" variant="secondary" size="sm" onClick={() => void load()}>
            <RefreshCw size={14} aria-hidden="true" />
            {t("refresh")}
          </Button>
        }
      >
        {data.rejected.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">{t("rejected_empty")}</p>
        ) : (
          <EntryTable
            entries={data.rejected}
            when={when}
            problem={problem}
            t={t}
            action={(entry) =>
              canResend && (
                <Button type="button" size="sm" variant="secondary" disabled={busy !== null} aria-busy={busy === entry.sendId} onClick={() => void resend(entry)}>
                  <Send size={14} aria-hidden="true" />
                  {t("resend")}
                </Button>
              )
            }
          />
        )}
      </Card>

      <Card title={t("waiting_title")} subtitle={t("waiting_subtitle")} flush>
        {data.waiting.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">{t("waiting_empty")}</p>
        ) : (
          <EntryTable entries={data.waiting} when={when} problem={problem} t={t} next />
        )}
      </Card>

      <Card title={t("errors_title")} flush>
        {data.recentErrors.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">{t("errors_empty")}</p>
        ) : (
          <EntryTable entries={data.recentErrors} when={when} problem={problem} t={t} />
        )}
      </Card>
    </div>
  );
}

function EntryTable({
  entries,
  when,
  problem,
  t,
  next,
  action,
}: {
  entries: OutboundEntry[];
  when: (v: string | null) => string;
  problem: (e: OutboundEntry) => string;
  t: (key: string) => string;
  next?: boolean;
  action?: (e: OutboundEntry) => React.ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("column_order")}</TableHead>
            <TableHead>{t("column_placed")}</TableHead>
            <TableHead>{t("column_attempts")}</TableHead>
            <TableHead>{t("column_problem")}</TableHead>
            {next && <TableHead>{t("column_next")}</TableHead>}
            {action && <TableHead>{t("column_actions")}</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((entry) => (
            <TableRow key={`${entry.sendId}-${entry.lastAttemptAt}`}>
              <TableCell>
                <a href={`/orders/${entry.orderId}`} className="font-mono text-xs font-semibold underline-offset-2 hover:underline" dir="ltr">
                  {entry.orderNumber}
                </a>
                <p className="font-mono text-[10px] text-muted-foreground" dir="ltr">{entry.sendId}</p>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">{when(entry.createdAt)}</TableCell>
              <TableCell className="text-xs">{entry.attempts}</TableCell>
              <TableCell className="max-w-xs text-xs text-destructive">{problem(entry)}</TableCell>
              {next && <TableCell className="text-xs text-muted-foreground">{when(entry.nextAttemptAt)}</TableCell>}
              {action && <TableCell>{action(entry)}</TableCell>}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function Page() {
  const t = useT("transmission");
  return (
    <DashboardChrome currentPath="/orders/transmission">
      <PageHeader title={t("page_title")} subtitle={t("page_subtitle")} />
      <Transmissions />
    </DashboardChrome>
  );
}

export default function TransmissionPageApp() {
  return (
    <RequireAuth>
      <Page />
    </RequireAuth>
  );
}
