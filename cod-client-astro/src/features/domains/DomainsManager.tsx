import { useEffect, useState, type FormEvent } from "react";
import { Globe, RefreshCw, Star, Trash2 } from "lucide-react";
import {
  Alert,
  Badge,
  Button,
  Card,
  IconButton,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  useConfirmDialog,
} from "@/components/ui";
import { useLocale, useT } from "@/i18n/react";
import { ApiError } from "@/lib/api";
import { notify } from "@/lib/notify";
import {
  addDomain,
  getDomains,
  makePrimaryDomain,
  removeDomain,
  verifyDomain,
  type ChannelDomain,
  type DomainsState,
} from "./api";
import { domainProblem, isRootDomain } from "./model";

const STATUS_TONE = { pending: "neutral", verified: "success", failed: "critical" } as const;

function errorKey(cause: unknown): string {
  if (cause instanceof ApiError) {
    switch (cause.code) {
      case "INVALID_DOMAIN":
        return "error.invalid";
      case "DOMAIN_TAKEN":
        return "error.taken";
      case "DOMAIN_ALREADY_ADDED":
        return "error.already_added";
      case "DOMAIN_LIMIT_REACHED":
        return "error.limit";
      case "DOMAIN_NOT_VERIFIED":
        return "error.not_verified";
      case "DOMAIN_NOT_REMOVABLE":
        return "error.not_removable";
    }
  }
  return "error.generic";
}

function DnsRecords({ hostname, dns }: { hostname: string; dns: DomainsState["dns"] }) {
  const t = useT("domains");
  const root = isRootDomain(hostname);
  const rows = root
    ? dns.ipv4.map((ip) => ({ type: "A", name: "@", value: ip }))
    : dns.cname
      ? [{ type: "CNAME", name: hostname, value: dns.cname }]
      : dns.ipv4.map((ip) => ({ type: "A", name: hostname, value: ip }));
  if (rows.length === 0) return <p className="text-xs text-muted-foreground">{t("dns_not_configured")}</p>;
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">{t(root ? "dns_hint_root" : "dns_hint_sub").replace("{domain}", hostname)}</p>
      <table className="w-full text-xs" dir="ltr">
        <thead>
          <tr className="text-muted-foreground">
            <th className="py-1 text-start font-semibold">{t("dns_type")}</th>
            <th className="py-1 text-start font-semibold">{t("dns_name")}</th>
            <th className="py-1 text-start font-semibold">{t("dns_value")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.type}-${row.value}`} className="font-mono">
              <td className="py-1">{row.type}</td>
              <td className="py-1">{row.name}</td>
              <td className="py-1 break-all">{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Certificate({ domain }: { domain: ChannelDomain }) {
  const t = useT("domains");
  const locale = useLocale();
  if (domain.kind === "subdomain") return <span className="text-xs text-muted-foreground">{t("certificate.platform")}</span>;
  if (domain.status !== "verified" || !domain.certificate) return <span className="text-xs text-muted-foreground">—</span>;
  const cert = domain.certificate;
  if (cert.status === "active") {
    return (
      <span className="text-xs">
        <Badge tone={cert.trusted ? "success" : "warning"} size="sm">
          {t(cert.trusted ? "certificate.active" : "certificate.untrusted")}
        </Badge>{" "}
        <span className="text-muted-foreground">{t("certificate.until").replace("{date}", new Date(cert.validTo).toLocaleDateString(locale))}</span>
      </span>
    );
  }
  return (
    <Badge tone={cert.status === "missing" ? "neutral" : "critical"} size="sm">
      {t(cert.status === "missing" ? "certificate.pending" : "certificate.error")}
    </Badge>
  );
}

export function DomainsManager() {
  const t = useT("domains");
  const locale = useLocale();
  const confirm = useConfirmDialog();
  const [state, setState] = useState<DomainsState | null>(null);
  const [failed, setFailed] = useState(false);
  const [hostname, setHostname] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);

  useEffect(() => {
    getDomains().then(setState, () => setFailed(true));
  }, []);

  async function run(key: string, action: () => Promise<DomainsState>, success?: string) {
    setBusy(key);
    try {
      setState(await action());
      if (success) notify.success(success);
    } catch (cause) {
      notify.error(t(errorKey(cause)));
    } finally {
      setBusy(null);
    }
  }

  async function add(event: FormEvent) {
    event.preventDefault();
    if (!hostname.trim()) return;
    setBusy("add");
    setAddError(null);
    try {
      setState(await addDomain(hostname.trim()));
      setHostname("");
      notify.success(t("added"));
    } catch (cause) {
      setAddError(t(errorKey(cause)));
    } finally {
      setBusy(null);
    }
  }

  async function remove(domain: ChannelDomain) {
    if (!(await confirm({ title: t("remove_title").replace("{domain}", domain.hostname), description: t("remove_body"), confirmLabel: t("remove"), tone: "danger" }))) {
      return;
    }
    await run(`remove-${domain.hostname}`, () => removeDomain(domain.hostname), t("removed"));
  }

  if (failed) return <Alert role="alert" tone="critical">{t("load_failed")}</Alert>;
  if (!state) return <p className="text-sm text-muted-foreground" role="status">…</p>;

  return (
    <div className="space-y-4">
      <Card title={t("add_title")} subtitle={t("add_subtitle")}>
        <form onSubmit={(event) => void add(event)} className="flex flex-wrap items-start gap-2">
          <div className="min-w-60 flex-1">
            <Input
              dir="ltr"
              value={hostname}
              placeholder="boutique.dz"
              aria-label={t("add_label")}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setHostname(event.currentTarget.value)}
            />
            {addError && <p role="alert" className="mt-1 text-xs font-medium text-destructive">{addError}</p>}
          </div>
          <Button type="submit" disabled={busy !== null || !hostname.trim()} aria-busy={busy === "add"}>
            <Globe size={16} aria-hidden="true" />
            {t("add")}
          </Button>
        </form>
      </Card>

      <Card flush>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("column_domain")}</TableHead>
              <TableHead>{t("column_status")}</TableHead>
              <TableHead>{t("column_certificate")}</TableHead>
              <TableHead>{t("column_actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {state.domains.map((domain) => {
              const problem = domainProblem(domain);
              return (
                <TableRow key={domain.hostname}>
                  <TableCell>
                    <div className="space-y-2">
                      <p className="flex flex-wrap items-center gap-2 font-semibold" dir="ltr">
                        {domain.hostname}
                        {domain.isPrimary && <Badge tone="brand" size="sm">{t("primary")}</Badge>}
                        {domain.kind === "subdomain" && <Badge tone="neutral" size="sm">{t("free_address")}</Badge>}
                      </p>
                      {domain.kind === "custom" && domain.status !== "verified" && <DnsRecords hostname={domain.hostname} dns={state.dns} />}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge tone={STATUS_TONE[domain.status]}>{t(`status.${domain.status}`)}</Badge>
                    {problem && (
                      <p className="mt-1 max-w-xs text-xs text-destructive">
                        {t(`problem.${problem.key}`).replace("{values}", "values" in problem ? problem.values.replace(/,/g, ", ") : "")}
                      </p>
                    )}
                    {domain.checkedAt && domain.kind === "custom" && (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {t("checked_at").replace("{date}", new Date(domain.checkedAt).toLocaleString(locale))}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    <Certificate domain={domain} />
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1">
                      {domain.kind === "custom" && (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={busy !== null}
                          aria-busy={busy === `verify-${domain.hostname}`}
                          onClick={() => void run(`verify-${domain.hostname}`, () => verifyDomain(domain.hostname))}
                        >
                          <RefreshCw size={14} aria-hidden="true" />
                          {t(domain.status === "verified" ? "check_again" : "verify")}
                        </Button>
                      )}
                      {!domain.isPrimary && domain.status === "verified" && (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={busy !== null}
                          onClick={() => void run(`primary-${domain.hostname}`, () => makePrimaryDomain(domain.hostname), t("primary_set"))}
                        >
                          <Star size={14} aria-hidden="true" />
                          {t("make_primary")}
                        </Button>
                      )}
                      {domain.kind === "custom" && !domain.isPrimary && (
                        <IconButton
                          type="button"
                          variant="danger"
                          aria-label={t("remove")}
                          title={t("remove")}
                          disabled={busy !== null}
                          onClick={() => void remove(domain)}
                        >
                          <Trash2 size={15} />
                        </IconButton>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
      <p className="text-xs text-muted-foreground">{t("redirect_note")}</p>
    </div>
  );
}
