import type pg from "pg";
import type { CertificateStatus } from "./tls-probe";
import { isoText } from "../../../cod-shared/db/text-time";

export const CERTIFICATE_EXPIRY_WARNING_DAYS = 7;

export type CertificateVerdict = { status: "active" | "missing" | "expiring" | "error"; error: string | null };

export function certificateVerdict(result: CertificateStatus, { requireTrusted, now = Date.now() }: { requireTrusted: boolean; now?: number }): CertificateVerdict {
  if (result.status === "missing") return { status: "missing", error: "no certificate is served for this hostname" };
  if (result.status === "error") return { status: "error", error: result.message };
  if (requireTrusted && !result.trusted) return { status: "error", error: `certificate not trusted (issuer ${result.issuer ?? "unknown"})` };
  if (Date.parse(result.validTo) - now < CERTIFICATE_EXPIRY_WARNING_DAYS * 24 * 3600 * 1000) {
    return { status: "expiring", error: `expires ${result.validTo}` };
  }
  return { status: "active", error: null };
}

export async function checkDomainCertificates(
  platform: pg.Pool,
  probe: (hostname: string) => Promise<CertificateStatus>,
  { requireTrusted, limit = 200, concurrency = 5 }: { requireTrusted: boolean; limit?: number; concurrency?: number },
): Promise<{ checked: number; failing: number }> {
  const { rows } = await platform.query<{ hostname: string }>(
    `select d.hostname from store_domains d join stores s on s.id = d.store_id
      where d.status = 'verified' and s.status <> 'archived'
      order by d.certificate_checked_at nulls first, d.hostname
      limit $1`,
    [limit],
  );
  let failing = 0;
  for (let i = 0; i < rows.length; i += concurrency) {
    await Promise.all(
      rows.slice(i, i + concurrency).map(async ({ hostname }) => {
        const verdict = certificateVerdict(await probe(hostname), { requireTrusted });
        if (verdict.status !== "active") failing++;
        await platform.query(
          `update store_domains
              set certificate_status = $2, certificate_error = $3,
                  certificate_checked_at = ${isoText("now()")}
            where hostname = $1`,
          [hostname, verdict.status, verdict.error],
        );
      }),
    );
  }
  return { checked: rows.length, failing };
}
