# Pixels and server-side conversions

Each channel (store or landing) has its own tracking settings, edited in the
dashboard under **Settings → Tracking & Analytics** (admins). Two channels of
one account never share a tracker: everything below is read from the channel
the visitor or the order belongs to.

Meta's conversion detail — event names, hashing, the four conversion modes —
is in [META-TRACKING.md](./META-TRACKING.md). This page covers the parts that
apply to every platform.

## Platforms

| Platform | Browser | Server-side | Identifiers |
|---|---|---|---|
| Meta | Pixel (`fbq`) | Conversions API | Pixel id (15–16 digits), access token, test event code |
| TikTok | Pixel (`ttq`) | Events API | Pixel code (20 letters/digits), access token, test event code |
| Snapchat | Pixel (`snaptr`) | Conversions API v3 | Pixel id (UUID), Conversions API token |
| GA4 | `gtag` | Measurement Protocol | Measurement id (`G-…`), API secret |
| Google Ads | `gtag` conversion | — (needs OAuth and a developer token) | Conversion id (`AW-…`), conversion label |

The identifiers are checked for format when the settings are saved
(`cod-shared/tracking/identifiers.ts`, the same rule in the dashboard and the
API). Tokens and secrets are write-only: the API returns a masked hint, and
leaving the field empty keeps the stored value. The storefront only ever
receives the public ids (`trackers` on `/store/config`).

## Events

The storefront fires through one core module (`cod-astro/theme01/src/core/tracking/track.ts`).
Each event goes to every tracker the page loaded, under that platform's own
name (`cod-shared/tracking/events.ts`):

| Funnel event | Meta | TikTok | Snapchat | GA4 |
|---|---|---|---|---|
| Page view | PageView | (page) | PAGE_VIEW | (page_view) |
| Product view | ViewContent | ViewContent | VIEW_CONTENT | view_item |
| Add to cart | AddToCart | AddToCart | ADD_CART | add_to_cart |
| Checkout start (first interaction with the form) | InitiateCheckout | InitiateCheckout | START_CHECKOUT | begin_checkout |
| Order submitted (thank-you page) | Purchase / Lead | CompletePayment / SubmitForm | PURCHASE / SIGN_UP | purchase / generate_lead |

Google Ads only receives the conversion (`conversion`, `send_to: AW-…/label`).

## One conversion per order and platform

The conversion event the merchant chooses (Lead or Purchase at checkout,
Purchase at confirmation, Purchase at delivery) decides **when** a
conversion exists. When it fires:

- **In the browser** — the thank-you page asks the server which event each
  tracker fires for this order (`GET /store/orders/{id}/tracking`) and sends
  it with the **order id** as the deduplication id (Meta `eventID`, TikTok
  `event_id`, Snap `client_dedup_id`, GA4/Google Ads `transaction_id`).
- **From the server** — the transaction that places or advances the order
  queues one job per configured platform (`kind = 'conversion'`) in the
  `jobs` table. The job's deduplication key is
  `conversion:{platform}:{orderId}:{event}`, so a retried checkout, a second
  status change or a changed conversion mode can never queue a second one. The
  server sends the same order id as its event id, so each platform merges the
  browser and server copies into one conversion.

## The job queue

`cod-server/src/platform/jobs.ts`. `src/node.ts` starts the worker; it claims
due jobs with `FOR UPDATE SKIP LOCKED` (several API replicas can run it),
locks each one for 5 minutes, and:

- marks it `done` with the provider's answer;
- on a network error, an HTTP 429 or a 5xx: puts it back `pending` with an
  exponential delay (30 s doubling, at most 6 h), up to 8 attempts;
- on a refusal (4xx): marks it `failed` with the provider's message.

A job whose worker died is taken back once its lock expires. Jobs are rows in
PostgreSQL, so a restart loses nothing. Before sending, the job re-reads the
order and the channel's settings: a platform removed since, or a conversion
event changed, makes it `done` with `{ skipped: "not_configured" }`. Meta,
TikTok and Snapchat events older than 7 days are skipped too.

Meta sends are also written to `capi_event_log` (the landing page "last
event" badge reads it).

## UTMs and click ids

`core/tracking/attribution.ts` keeps `utm_source`, `utm_medium`,
`utm_campaign`, `utm_content`, `utm_term`, `gclid`, `ttclid` and `fbclid` from
the landing URL in `sessionStorage` for the session (a later visit with its own
parameters replaces them). At submit time it fills the order form's
`attribution` field with them, the ad cookies (`_ttp`, `_scid`, `_ga`) and the
consent decision, and fills `fbc` from `fbclid` when Meta's cookie is missing.
The order stores them (`orders.utm_*`, `gclid`, `ttclid`, `fbclid`,
`ad_cookies`, `tracking_consent`); the campaign also goes to Aventy as
`journey.campaign` in the outbound payload.

## Consent

Aventy's legal team defines the policy (law 18-07); the switch is ready for
it. With **Ask visitors for consent** on (`consent_required`, off by
default), the channel shows a banner; no tracker script loads and no browser
event is sent until the visitor accepts (a `cod_consent` cookie, 180 days),
and no server-side conversion is queued for an order without consent. With
the switch off, everything fires as described above.

## Diagnostics

Under the settings, **Diagnostics** sends a test event per server-side
platform (Meta and TikTok to their test stream — the test event code must be
saved; Snapchat and GA4 to their validation endpoints, which record nothing)
and lists the channel's latest conversions with their status, attempts and
last error (`POST /api/tracking/test`, `GET /api/tracking/events`).
