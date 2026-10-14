import type pg from "pg";
import { isoText } from "../../../cod-shared/db/text-time";

export const STALE_JOB_MINUTES = 30;
export const CERTIFICATE_GRACE_HOURS = 1;
export const UNCHECKED_CERTIFICATE_HOURS = 2;

export interface PlatformStatus {
  ok: boolean;
  checks: {
    database: { ok: boolean; error?: string };
    outbound: { ok: boolean; waiting: number; stale: number; oldestWaitingMinutes: number | null };
    jobs: { ok: boolean; due: number; oldestDueMinutes: number | null };
    certificates: { ok: boolean; failing: Array<{ hostname: string; status: string; error: string | null }> };
  };
}

export async function platformStatus(platform: pg.Pool, { certificatesChecked }: { certificatesChecked: boolean }): Promise<PlatformStatus> {
  try {
    const [outbound, jobs, certificates] = await Promise.all([
      platform.query<{ waiting: number; stale: number; oldest: number | null }>(
        `select count(*) filter (where status = 'pending')::int as waiting,
                count(*) filter (where status = 'pending' and queued_at < now() - interval '24 hours')::int as stale,
                floor(extract(epoch from now() - min(queued_at) filter (where status = 'pending')) / 60)::int as oldest
           from outbound_orders`,
      ),
      platform.query<{ due: number; oldest: number | null }>(
        `select count(*)::int as due, floor(extract(epoch from now() - min(run_at)) / 60)::int as oldest
           from jobs where status = 'pending' and run_at <= now()`,
      ),
      certificatesChecked
        ? platform.query<{ hostname: string; status: string; error: string | null }>(
            `select d.hostname, coalesce(d.certificate_status, 'unchecked') as status, d.certificate_error as error
               from store_domains d join stores s on s.id = d.store_id
              where d.status = 'verified' and s.status <> 'archived'
                and ((d.certificate_status <> 'active' and d.verified_at < ${isoText("now() - make_interval(hours => $1)")})
                  or (d.certificate_checked_at is null and d.verified_at < ${isoText("now() - make_interval(hours => $2)")}))
              order by d.hostname
              limit 20`,
            [CERTIFICATE_GRACE_HOURS, UNCHECKED_CERTIFICATE_HOURS],
          )
        : { rows: [] as Array<{ hostname: string; status: string; error: string | null }> },
    ]);
    const o = outbound.rows[0];
    const j = jobs.rows[0];
    const checks = {
      database: { ok: true },
      outbound: { ok: o.stale === 0, waiting: o.waiting, stale: o.stale, oldestWaitingMinutes: o.oldest },
      jobs: { ok: (j.oldest ?? 0) < STALE_JOB_MINUTES, due: j.due, oldestDueMinutes: j.oldest },
      certificates: { ok: certificates.rows.length === 0, failing: certificates.rows },
    };
    return { ok: Object.values(checks).every((c) => c.ok), checks };
  } catch (err) {
    return {
      ok: false,
      checks: {
        database: { ok: false, error: err instanceof Error ? err.message : String(err) },
        outbound: { ok: false, waiting: 0, stale: 0, oldestWaitingMinutes: null },
        jobs: { ok: false, due: 0, oldestDueMinutes: null },
        certificates: { ok: false, failing: [] },
      },
    };
  }
}
