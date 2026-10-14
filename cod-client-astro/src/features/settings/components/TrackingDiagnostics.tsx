import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Send } from "lucide-react";
import { Badge, Button, Card, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui";
import { useLocale, useT } from "@/i18n/react";
import { ApiError } from "@/lib/api";
import { getConversionEvents, sendTrackingTestEvent } from "@/features/settings/api";
import type { ConversionEventRow, ServerTrackingProvider } from "@/features/settings/types";

const PROVIDERS: ServerTrackingProvider[] = ["meta", "tiktok", "snap", "ga4"];
const STATUS_TONE = { pending: "neutral", running: "info", done: "success", failed: "critical" } as const;

type TestOutcome = { ok: boolean; text: string };

export function TrackingDiagnostics({ refreshKey }: { refreshKey: number }) {
  const t = useT("settings");
  const locale = useLocale();
  const [events, setEvents] = useState<ConversionEventRow[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [testing, setTesting] = useState<ServerTrackingProvider | null>(null);
  const [outcomes, setOutcomes] = useState<Partial<Record<ServerTrackingProvider, TestOutcome>>>({});
  const name = (provider: ServerTrackingProvider) => t(`store.tracking_provider_${provider}`);

  const load = useCallback(() => {
    setLoadFailed(false);
    getConversionEvents().then(setEvents, () => setLoadFailed(true));
  }, []);

  useEffect(load, [load, refreshKey]);

  async function test(provider: ServerTrackingProvider) {
    setTesting(provider);
    try {
      const result = await sendTrackingTestEvent(provider);
      const text = result.ok
        ? t("store.tracking_diag_test_ok").replace("{provider}", name(provider))
        : result.message === "test_event_code_missing"
          ? t("store.tracking_diag_test_code_missing")
          : t("store.tracking_diag_test_failed").replace("{provider}", name(provider)).replace("{message}", result.message ?? "");
      setOutcomes((current) => ({ ...current, [provider]: { ok: result.ok, text } }));
    } catch (cause) {
      const text =
        cause instanceof ApiError && cause.code === "TRACKING_NOT_CONFIGURED" ? t("store.tracking_diag_not_configured") : t("store.tracking_diag_test_error");
      setOutcomes((current) => ({ ...current, [provider]: { ok: false, text } }));
    } finally {
      setTesting(null);
    }
  }

  return (
    <Card
      title={t("store.tracking_diag_title")}
      subtitle={t("store.tracking_diag_subtitle")}
      action={
        <Button type="button" variant="secondary" size="sm" onClick={load}>
          <RefreshCw size={14} aria-hidden="true" />
          {t("store.tracking_diag_refresh")}
        </Button>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-2 sm:grid-cols-2">
          {PROVIDERS.map((provider) => (
            <div key={provider} className="rounded-lg border border-border/80 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">{name(provider)}</span>
                <Button type="button" variant="secondary" size="sm" disabled={testing !== null} aria-busy={testing === provider} onClick={() => void test(provider)}>
                  <Send size={14} aria-hidden="true" />
                  {t("store.tracking_diag_test")}
                </Button>
              </div>
              {outcomes[provider] && (
                <p role="status" className={`mt-2 text-xs ${outcomes[provider]!.ok ? "text-emerald-600" : "text-destructive"}`}>
                  {outcomes[provider]!.text}
                </p>
              )}
            </div>
          ))}
        </div>

        {loadFailed ? (
          <p role="alert" className="text-sm text-destructive">{t("store.tracking_diag_load_failed")}</p>
        ) : events && events.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("store.tracking_diag_empty")}</p>
        ) : events ? (
          <div className="-mx-4 overflow-x-auto sm:-mx-5">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("store.tracking_diag_order")}</TableHead>
                  <TableHead>{t("store.tracking_diag_platform")}</TableHead>
                  <TableHead>{t("store.tracking_diag_event")}</TableHead>
                  <TableHead>{t("store.tracking_diag_status")}</TableHead>
                  <TableHead>{t("store.tracking_diag_when")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event) => {
                  const skipped = event.status === "done" && event.result?.skipped;
                  return (
                    <TableRow key={event.id}>
                      <TableCell>
                        <span dir="ltr" className="font-mono text-xs">{event.orderNumber ?? "—"}</span>
                      </TableCell>
                      <TableCell>{name(event.provider)}</TableCell>
                      <TableCell>
                        {event.eventName} <span className="text-xs text-muted-foreground">· {t(`store.tracking_diag_stage_${event.stage}`)}</span>
                      </TableCell>
                      <TableCell>
                        <Badge tone={skipped ? "warning" : STATUS_TONE[event.status]} size="sm">
                          {skipped ? t("store.tracking_diag_skipped") : t(`store.tracking_diag_status_${event.status}`)}
                        </Badge>
                        {event.attempts > 1 && (
                          <span className="ms-2 text-xs text-muted-foreground">{t("store.tracking_diag_attempts").replace("{n}", String(event.attempts))}</span>
                        )}
                        {event.lastError && event.status !== "done" && (
                          <p className="mt-1 max-w-xs break-words text-xs text-destructive" dir="ltr">{event.lastError}</p>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">{new Date(event.createdAt).toLocaleString(locale)}</span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground" role="status">…</p>
        )}
      </div>
    </Card>
  );
}
