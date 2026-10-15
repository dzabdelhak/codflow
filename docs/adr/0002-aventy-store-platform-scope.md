# Orestor becomes a multi-store e-commerce layer for Aventy ERP

Aventy ERP is adding a module that lets any Aventy user create online stores
in one click — several stores per user. Instead of building it from scratch we
build it on Orestor, which already covers the storefront, COD checkout, cart,
anti-fraud, tracking, legal pages and landing pages. The integration contract
is Aventy's guide (`docs/AVENTY-INTEGRATION.md`, Oct 8 2026); where the
functional spec (`docs/CAHIER-DES-CHARGES-ZIMOU-MARKET-V2.md`) disagrees with
it, **the Aventy guide wins**.

## Model

```
Aventy account (merchant)
 ├── Store A  ← own Aventy key, own published catalog, own domain, own orders
 ├── Store B
 └── Store C
```

The **store** is the data boundary. A small platform-level layer above the
stores holds accounts, store ownership, plan limits, domain → store routing
and the merchant-wide phone blocklist.

## Decisions

| Topic | Decision |
|---|---|
| Source of truth | Aventy owns products, variants, prices, stock, shipping fees, site sections/theme (via the template manifest) and orders after acceptance. We keep versioned copies, pulled by snapshot + changes + 1-minute heartbeat. |
| Store creation | One click: Aventy redirects the merchant to our platform with a signed one-time token; the store and its Aventy key are created automatically. No inbound call from Aventy, no key pasting. |
| Stores per account | Several; the limit comes from the merchant's Aventy plan. |
| Merchant login | Aventy account (SSO); roles and permissions come from Aventy. |
| Our console holds | Pixels & tracking, custom domain, legal pages, anti-fraud settings and blocked-attempt log, order exports. Everything else is configured in Aventy. |
| Landing pages | Our landing page builder replaces Aventy's existing module. Landing page orders use the same outbound queue as the checkout. |
| Offers, bundles, promo codes | Not in V1. Prices shown are always Aventy's (normal or promo price). |
| Orders out | Recorded first in our durable queue with a ULID, then sent to Aventy; retried forever with backoff; never refused because Aventy is down, stock is uncertain or no fee grid is known ("frais à confirmer", never 0 DA). |
| Anti-fraud | Rules of guide §7; the phone blocklist is shared across a merchant's stores. |
| Purchase event | Each store chooses when it fires: on submit, on Aventy confirmation, or on delivery. |
| Tracking | Browser pixels plus server-side events (Meta Conversions API, TikTok Events API). |
| Customer accounts | None in V1: guest checkout, browser-side favourites/cart, tracking by order number + phone. |
| Domains | Every store gets a free subdomain of a base domain (not yet chosen); merchants can link a domain they buy themselves. |
| Exports | Excel and Google Sheets. |
| AI in V1 | Content generation (validated by the merchant before publishing), smart search, shopping and merchant assistants. Sold as a paid add-on. |
| Consent / law 18-07 | Aventy's legal team defines the policy; we implement it. |

## Considered Options

- **Build from scratch**: rejected — Orestor already implements most of the
  storefront requirements.
- **Spec V2 as written** (product selection and template editing in our
  back-office, manual Aventy connection setup): rejected where it contradicts
  the Aventy guide, which is the binding contract.
- **Keep Aventy's landing page module and skip ours / run both**: rejected —
  ours replaces it to avoid two systems to keep in sync.

## Consequences

- Orestor is single-tenant today: core tables (`products`, `orders`,
  `customers`, `users`, …) have no `store_id`. Multi-store isolation is the
  largest piece of work. The approach — database per store vs shared
  database with `store_id` — is **not decided yet** and gets its own ADR
  after a spike.
- Much of Orestor's merchant dashboard (product, stock, shipping-fee,
  carrier, order-processing screens) is unused for Aventy stores.
- `cod-astro/theme01` must render pages from Aventy's section data and
  publish a manifest, instead of hardcoded component sequences.
- The Aventy key must be encrypted at rest with the encryption key stored
  outside the database (guide §3) — stricter than ADR-0001's choice for the
  Sendili key.
- Depends on Aventy building: the signed redirect token for store creation,
  an SSO login (OAuth/OpenID), and readable order statuses for the
  confirmation/delivery Purchase options.
- Risks accepted with eyes open: AI features in V1 enlarge scope and may delay
  the core (sync, orders, landing pages); landing pages without offers may be
  weaker than Aventy's current module if it supports them.

## Open questions

- Multi-store isolation approach (see Consequences).
- Base domain for subdomains.
- Whether Aventy's current landing pages support offers, and what migrating
  existing merchant pages involves.
