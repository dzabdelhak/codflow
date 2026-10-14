# Order transmission

Every storefront order is recorded with an entry in `outbound_orders` in the
same transaction (ULID send id, the guide §5.2 payload). A worker then
delivers it to the order destination (Aventy guide §5–6, §8).

## The worker

`cod-server/src/platform/outbound/worker.ts`, started by `src/node.ts` on every
API server (4 concurrent senders each).

- **One server at a time.** A sender claims the entry with
  `FOR UPDATE SKIP LOCKED` and holds that row lock for the whole send, in one
  transaction. A server killed mid-send loses the transaction, the lock is
  released, and another server resends the same send id — the destination
  deduplicates on it (it answers "already received"). A send that has no
  answer within 30 s counts as a failure.
- **Creation order, per channel.** An entry is sent only when no older entry of
  its channel is still waiting, so a channel's orders arrive in the order they
  were placed. Channels send in parallel.
- **Only a recognised success is a success.** The destination's answer must be
  one of the kinds below, with the fields it needs; anything else is treated
  as "unknown": the entry stays in the queue and an alert is logged.

| Answer | Entry |
|---|---|
| accepted / duplicate (same send id) | `sent`, remote id kept |
| review (with motifs) | `sent`, motifs kept in `outcome_detail` |
| rejected (fields at fault) | `rejected`, never retried; resend from the console |
| retry, unknown, no answer / error | stays `pending`, retried after 15 s, doubling up to 1 h, forever |

## The destination

`cod-server/src/platform/outbound/destination.ts` defines the contract
(`OrderDestination`). `ORDER_DESTINATION` picks one; today only `test` exists:
it accepts every order with remote id `TEST-<send id>`, and
`OUTBOUND_TEST_FAILURE_RATE` (0–1) makes it answer "retry" that often, to
watch the queue under failure. Aventy's destination comes with ticket 15.

## Diagnostics

The dashboard's **Orders → Transmission** screen (per channel) shows the
connection state (from the last attempt), the last successful transmission,
waiting / sent / rejected counts, the rejected orders with their fields at
fault, the waiting ones with their next attempt, and the recent errors.
**Resend** (orders:update) re-reads the customer block (name, phone, wilaya,
commune, address) from the order as corrected in the dashboard and queues the
entry again with the same send id.

## Alerts

An entry waiting more than 24 hours raises an alert once: a structured log line
`{"event":"outbound.stale", sendId, storeId, ageHours, attempts, lastOutcome}`
(checked every 10 minutes), and a banner for admins in the dashboard. Rejected
and unknown answers log `outbound.rejected` / `outbound.unknown_answer`. Logs
carry send ids, channel ids, counts and field names — never the payload, a
phone number, a name or a secret.
