# Landing channels

A channel is either an online store or a landing page (`stores.channel_type`,
`store` or `landing`). A landing sells **one main product**: its only
`channel_products` row. Orders on it go through the same order endpoint and
outbound queue as a store's.

## Creating one

`POST /api/merchant/stores` with `type: "landing"`, `productIds` holding exactly
the main product, and optionally `unavailableRule` (see
`docs/CHANNEL-CREATION.md`). Its template is `landing01`. The dashboard
wizard asks for one product (a radio list) and the rule in its products step.

## One product, enforced by the database

- The `channel_products_landing_single` trigger refuses a second product on a
  landing (the API answers 409 `LANDING_SINGLE_PRODUCT`).
- `POST /api/channel-products` and `DELETE /api/channel-products/{id}` refuse
  on a landing with the same code.
- A product created while a landing is the active channel is not added to it
  (the `add_to_current_channel` trigger skips landings).
- The main product changes only through `PUT /api/landing-channel/main-product`
  (the dashboard's Products → Main product → Replace), which makes the chosen
  catalogue product the landing's only one, published.

## When the main product is unavailable

The product is **unavailable** when it is archived or draft, hidden, deleted,
or not shown on the landing — the SQL function `main_product_available(store)`
is the single definition. Running out of stock does not count: orders are still
taken, with "stock not guaranteed".

`stores.unavailable_rule` decides what the public page does meanwhile
(`PATCH /api/landing-channel`):

| Rule | Public page |
|---|---|
| `hide_order_form` | stays online and presents the product, without the order form |
| `show_unavailable` (default) | stays online, an unavailability notice replaces the form |
| `suspend` | answers 503 `CHANNEL_UNAVAILABLE` (the neutral page) |

`suspend` is computed when the storefront resolves the channel
(`scopeForHost` → `channelPublicAccess`): the channel's status stays
`published`, and the page comes back by itself once the product is available.
Whatever the rule, the order endpoint refuses a product that is not sellable.

## Storefront

`GET /store/config` carries `channelType` and `unavailableRule`;
`GET /store/landing` returns the main product in the full store-product shape
(even while unavailable), `available` and the rule. theme01 renders the landing
on `/` (`src/theme/components/landing/LandingPage.astro`): banner, product,
gallery, benefits, price, order form, FAQ, reassurance. Its texts are content
keys (`landing*`) the store's `contentJson` can override; benefits show only
once filled in. Store-only pages (`/products`, `/products/*`, `/category/*`,
`/checkout`, `/lp/*`) redirect to `/` on a landing.

## Dashboard

On a landing, the nav hides the catalogue list, "In this store", categories and
landing pages, and shows Products → Main product. Opening a hidden screen by URL
shows a notice instead (`ChannelOnly`). The product form shows no per-store
visibility toggle on a landing.
