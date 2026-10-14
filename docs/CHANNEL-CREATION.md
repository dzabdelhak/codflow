# Creating a sales channel

One API creates a sales channel, whoever starts the creation: the dashboard's
creation wizard today, and Aventy's « Créer un canal de vente » button later.

```
POST /api/merchant/stores
```

The full contract (request, responses, error codes) is in the OpenAPI document
served by cod-server (`operationId: createMerchantStore`).

## What one call does

In a single transaction, for the signed-in user's merchant:

1. Checks the merchant's plan allows another channel (the plan-policy seam,
   `cod-server/src/platform/plan-policy.ts`, where Aventy's plan check plugs in).
2. Generates the channel id and gives it the free subdomain
   `<subdomain>.<STORE_BASE_DOMAIN>`.
3. Saves the selected catalogue products, in display order, published.
4. Saves the delivery modes the channel offers and, optionally, its own default
   shipping profile (otherwise the account's default profile prices it).
5. Applies the chosen template (below) and its colours and font.
6. Adds the merchant's own domain, when `customDomain` is given, as a
   `pending` domain of the channel: it serves once its DNS points at the
   platform and is verified from the Domains screen (`docs/CUSTOM-DOMAINS.md`).
   An invalid domain answers 400 `INVALID_DOMAIN`, one used by another channel
   409 `DOMAIN_TAKEN`, and nothing is created.
7. Seeds the four legal pages.

A `landing` channel sells one main product: `productIds` holds exactly that
one, and `unavailableRule` (`hide_order_form`, `show_unavailable` — the
default — or `suspend`) says what its page does while that product is
unavailable (see `docs/LANDING-CHANNEL.md`).

The channel starts as `draft` and is not reachable on its address until it is
published (`PATCH /api/merchant/stores/{id}/status`).

## Ready-made templates

A template is a starting design on one of the two base templates
(`cod-shared/channels/templates.ts`): colours, font, section order and
visibility, and texts in Arabic, French and English.

| Id | Type | Base | Look |
|----|------|------|------|
| `theme01` | store | theme01 | Violet and amber, Cairo, every home section (the default) |
| `boutique` | store | theme01 | Charcoal and gold on cream, Tajawal, fashion photo and new arrivals first |
| `electro` | store | theme01 | Blue and cyan, IBM Plex, tech banner then strengths and best sellers |
| `landing01` | landing | landing01 | Violet and amber, Cairo, every landing section (the default) |
| `flash` | landing | landing01 | Red and yellow, Almarai, price and order form right under the banner |

The channel's `theme_id` is the template id; `manifestFor` maps it to its base
manifest. Creation writes the template's colours and font into the channel,
and a channel with no published design renders the template's document
(`templateDesign`), until the merchant publishes their own from the Design
screen. `templates.test.ts` checks every template against its base manifest.

## Idempotency

Send a `creationKey` that stays the same for every attempt of one creation (a
double click, a network retry, a creation resumed after an error). If a channel
was already created with that key, the API returns it with `200` and
`created: false`, exactly as that first creation made it — answers that differ
from the first attempt are not applied — and creates nothing; a new creation
answers `201` with `created: true`. To create a different channel, send a new
key. The dashboard wizard keeps its key, and
everything entered, in the browser until the creation succeeds.

## Aventy's flow

Aventy's « Créer un canal de vente » button opens the dashboard with a signed
one-time link (`docs/AVENTY-CONNECTOR.md`): the merchant is signed in, or its
account is created on first use, and lands in this wizard with its Aventy
products in the catalogue. The wizard then calls this endpoint like any other
creation. The plan check will ask Aventy whether the plan permits another
channel.
