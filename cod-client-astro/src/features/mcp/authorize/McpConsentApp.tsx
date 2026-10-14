import { useEffect, useMemo, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Alert, Badge, Button } from "@/components/ui";
import { useT } from "@/i18n/react";
import { authClient } from "@/lib/auth/client";
import { ALL_SCOPES } from "../../../../../cod-shared/rbac/scopes";
import { answerConsent, getChannelChoice, publicClient } from "./api";

export default function McpConsentApp() {
  const t = useT("mcp");
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const clientId = params.get("client_id") ?? "";
  const requested = useMemo(() => (params.get("scope") ?? "").split(" ").filter(Boolean), [params]);
  const [client, setClient] = useState<{ name: string; uri: string | null } | null>(null);
  const [channel, setChannel] = useState<string | null>(null);
  const [grantable, setGrantable] = useState<string[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    (async () => {
      const [info, choice, session] = await Promise.all([publicClient(clientId), getChannelChoice(), authClient.getSession()]);
      const data = session.data as { user?: { role?: string }; scopes?: string[] } | null;
      const mine = data?.user?.role === "admin" || data?.scopes?.includes("*") ? ALL_SCOPES : (data?.scopes ?? []);
      const allowed = requested.filter((s) => (ALL_SCOPES as string[]).includes(s) && (mine as string[]).includes(s));
      setClient(info ?? { name: clientId, uri: null });
      setChannel(choice?.channels.find((c) => c.id === choice.selected)?.name ?? null);
      setGrantable(allowed);
      setSelected(new Set(allowed));
    })().catch(() => setFailed(true));
  }, [clientId, requested]);

  async function answer(accept: boolean) {
    setBusy(true);
    setFailed(false);
    try {
      const extras = requested.filter((s) => !(ALL_SCOPES as string[]).includes(s));
      const next = await answerConsent(accept, [...extras, ...selected]);
      if (next) window.location.href = next;
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  const toggle = (scope: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(scope)) next.delete(scope);
      else next.add(scope);
      return next;
    });

  if (failed && !grantable) return <div className="mx-auto max-w-md px-4 py-12"><Alert role="alert" tone="critical">{t("authorize.error")}</Alert></div>;
  if (!grantable || !client) return <p className="px-4 py-12 text-center text-sm text-muted-foreground" role="status">…</p>;

  return (
    <div className="mx-auto max-w-lg space-y-5 px-4 py-12">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-1 text-primary" size={28} aria-hidden="true" />
        <div>
          <h1 className="text-2xl font-bold">{t("authorize.consent_title").replace("{app}", client.name)}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("authorize.consent_channel").replace("{channel}", channel ?? "—")}{" "}
            <a href={`/mcp/channel${window.location.search}`} className="font-semibold text-foreground underline underline-offset-2">
              {t("authorize.change_channel")}
            </a>
          </p>
        </div>
      </div>
      {failed && <Alert role="alert" tone="critical">{t("authorize.error")}</Alert>}
      {grantable.length === 0 ? (
        <Alert tone="warning">{t("authorize.no_permission")}</Alert>
      ) : (
        <fieldset className="space-y-2 rounded-xl border border-border p-4">
          <legend className="px-1 text-sm font-semibold">{t("authorize.permissions")}</legend>
          {grantable.map((scope) => (
            <label key={scope} className="flex items-center gap-2 text-sm">
              <input type="checkbox" aria-label={scope} checked={selected.has(scope)} onChange={() => toggle(scope)} />
              <Badge tone="neutral" size="sm">
                <span dir="ltr">{scope}</span>
              </Badge>
            </label>
          ))}
        </fieldset>
      )}
      <div className="flex gap-2">
        <Button type="button" disabled={busy || selected.size === 0} onClick={() => void answer(true)}>
          {t("authorize.allow")}
        </Button>
        <Button type="button" variant="secondary" disabled={busy} onClick={() => void answer(false)}>
          {t("authorize.deny")}
        </Button>
      </div>
    </div>
  );
}
