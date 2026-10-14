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
5. Applies the chosen template (`theme01` is the only store template today).
6. Seeds the four legal pages.

The channel starts as `draft` and is not reachable on its address until it is
published (`PATCH /api/merchant/stores/{id}/status`).

## Idempotency

Send a `creationKey` that stays the same for every attempt of one creation (a
double click, a network retry, a creation resumed after an error). If a channel
was already created with that key, the API returns it with `200` and creates
nothing; a new creation answers `201`. The dashboard wizard keeps its key, and
everything entered, in the browser until the creation succeeds.

## Aventy's flow (to come)

Aventy's button will call the same endpoint with the same body. What changes is
authentication: instead of a dashboard session, a token signed by Aventy that
names the merchant, so the creation needs no CodFlow login. The plan check will
ask Aventy whether the plan permits another channel.
