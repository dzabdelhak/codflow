# 14: Order transmission worker and diagnostics

**What to build:** A worker on every app server drains the outbound queue: each entry reserved by one server at a time (SKIP LOCKED), retried with growing backoff forever, delivered in creation order, and only marked sent on a recognised success; an unknown answer is never a success. The destination is pluggable (today a test destination; Aventy in ticket 15). A diagnostics screen per channel shows connection state, last successful transmission, recent errors, entries waiting, and lets the merchant resend a rejected order. An alert fires when an order has waited more than 24 hours. Logs hold no secrets and no unnecessary personal data.

**Blocked by:** 02, 03

**Status:** done

- [x] With the destination failing 30% of the time, every order is delivered exactly once and never by two servers at once
- [x] Killing a server mid-send leaves the order to be resent and deduplicated by its send id
- [x] The diagnostics screen shows waiting, sent and rejected orders and can resend a rejected one
- [x] An order waiting more than 24 hours raises an alert
