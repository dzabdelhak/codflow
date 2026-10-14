# cod-shared

**The single source of truth shared by `cod-server` and `cod-client-astro`.**

`cod-shared` holds everything the backend and dashboard must agree on:

- **The database schema** — every table, defined once.
- **Read/write queries** — the shared business-logic data access layer.
- **RBAC** — the canonical permission scope registry + check helpers.
- **Error codes** — one registry of error codes and categories for the whole API.

It is **TypeScript source, imported directly** — there is no build step and
nothing is published. Edit a file here and both apps see it on their next build.

---

## Table of contents

1. [Why a shared package?](#why-a-shared-package)
2. [Directory layout](#directory-layout)
3. [Database schema](#database-schema)
4. [Drizzle client](#drizzle-client)
5. [Queries (`queries/`)](#queries-queries)
6. [RBAC (`rbac/`)](#rbac-rbac)
7. [Error codes (`errors/`)](#error-codes-errors)
8. [How the apps consume it](#how-the-apps-consume-it)
9. [Migrations workflow](#migrations-workflow)
10. [Rules & conventions](#rules--conventions)

---

## Why a shared package?

Before `cod-shared` existed, the schema and logic lived in the server and the
dashboard maintained its own copies. That meant a column added in one place was
silently missing in the other. Today:

- `cod-server` and `cod-client-astro` use the **same PostgreSQL database with
  the same table definitions** — they literally cannot drift.
- The dashboard's better-auth tables live in the same schema its auth server
  authenticates against, and the API serves reads through the same shared
  query functions everywhere.
- RBAC scopes and error codes have a single canonical definition.

---

## Directory layout

```
cod-shared/
├── db/
│   ├── schema.ts     # All 46 Drizzle table definitions (single source of truth)
│   ├── client.ts     # getDb(client) factory + AppDb type, first/one helpers
│   └── pools.ts      # PostgreSQL pools per role (codflow_app / codflow_platform), withStore
├── queries/          # Dependency-injected data-access functions (one file per domain)
├── rbac/
│   ├── scopes.ts     # SCOPES registry, Scope type, SCOPE_CATEGORIES
│   └── utils.ts      # hasPermission / hasAnyPermission / hasAllPermissions
└── errors/
    └── codes.ts      # ERROR_CODES, ErrorCode type, ERROR_CATEGORIES
```

Runtime deps: `drizzle-orm`, `pg` and `html-rewriter-wasm` (rich-text sanitising).

---

## Database schema

The canonical schema — **all table definitions, grouped by domain** (46 tables):

| Domain | Tables |
|--------|--------|
| **Auth (Better Auth)** | `users`, `userScopes`, `sessions`, `accounts`, `verifications` |
| **MCP / OAuth** | `jwkss`, `oauthClients`, `oauthRefreshTokens`, `oauthAccessTokens`, `oauthConsents` |
| **Customers** | `customers`, `customerGroups`, `customerGroupMembers`, `customerTags`, `customerTagAssignments` |
| **Geo (Algeria)** | `wilayas`, `communes` |
| **Shipping** | `shippingProfiles`, `shippingRules`, `shippingRuleCommunes` |
| **Delivery** | `drivers`, `driverCompensations`, `driverPayments`, `deliveryCompanies`, `companyStopDesks`, `companyShipments`, `companyApiLogs` |
| **Products** | `productCategories`, `products`, `productVariants`, `productImages`, `orderProducts` |
| **Orders** | `orders`, `orderAssignments`, `orderStatusHistory`, `abandonedOrders` |
| **Offers / Reviews** | `offers`, `reviews` |
| **Store** | `stores`, `storeApiKeys`, `dashboardBrand`, `storePixelConfig` |
| **Stock** | `stockMovements` |
| **Analytics / Audit** | `activityLogs`, `capiEventLog`, `webhookEvents` |

Both apps re-export the shared schema so feature code never imports raw
`cod-shared` paths:

```ts
// cod-server:       src/db/schema.ts  →  export * from "../../../cod-shared/db/schema";
// cod-client-astro: consumes cod-shared/db/client + schema via relative imports in src/lib/auth/server.ts

// in feature code, via the "@/" alias:
import { users } from "@/db/schema";
```

---

## Drizzle client

The Drizzle factory — it wires a node-postgres connection to the shared schema:

```ts
import { getDb } from "cod-shared/db/client";

// cod-server's request scope (src/db/scope.ts) does this once per request,
// on a connection already in a transaction pinned to the store:
const db = getDb(client, { inTransaction: true });   // AppDb
```

- **`getDb(client)`** — builds a typed Drizzle instance bound to the shared
  schema, plus `batch` (all-or-nothing), `all`, `get` and `run` for raw SQL.
- **`AppDb`** — the type of that instance (`ReturnType<typeof getDb>`);
  **every shared query takes `db: AppDb`** as its first argument. This is the
  dependency-injection pattern: queries never read environment or globals, so
  they are trivially testable against any database.
- **`first` / `one`** — single-row helpers: `.then(first)` gives the row or
  undefined, `.then(one)` throws when a write returned no row.
- **`pools.ts`** — `createDatabase` opens one pool per role: `codflow_app`
  (request code, under Row-Level Security) and `codflow_platform` (platform
  code, bypasses RLS). `withStore` runs a function in one transaction pinned to
  a store.

---

## Queries (`queries/`)

One file per domain, all following the same shape:

```ts
export async function listOrders(db: AppDb, filters: OrderFilters = {}) { … }
export async function getOrderById(db: AppDb, orderId: string) { … }
```

`cod-server` handlers import these — writes (create/update/status transitions)
run in the server, and reads call the same functions against the same
PostgreSQL database. The Astro dashboard goes through the REST API seam (no direct query
imports), so every dashboard read also lands on these functions.

Available modules: `abandoned-orders`, `activity-logs`, `analytics`,
`customer-groups`, `customer-tags`, `customers`, `delivery-companies`,
`driver-payments`, `drivers`, `mcp-connections`, `offers`, `orders`,
`pixel-config`, `product-groups`, `products`, `reviews`, `shipping-profiles`,
`stock`, `store`, `stores`, `users`, `variants`, `webhooks`, `wilayas`.

> **If you touch a domain's reads, update the shared query — never write a
> local copy inside a package.**

---

## RBAC (`rbac/`)

### `scopes.ts`

The **canonical scope registry**. Scopes follow `resource:action`
(e.g. `"orders:create"`, `"delivery:dispatch"`, `"*"` for admin):

- `SCOPES` — the frozen registry (const object).
- `Scope` — the type of any valid scope string.
- `ALL_SCOPES` — every scope except the `*` wildcard (used for assignable lists).
- `SCOPE_CATEGORIES` — scopes grouped for the dashboard's permissions UI.

### `utils.ts`

Framework-agnostic checks used on both sides of the boundary:

- `hasPermission(userScopes, requiredScope)` — wildcard-aware single check.
- `hasAnyPermission(userScopes, requiredScopes)` — at least one of a list.
- `hasAllPermissions(userScopes, requiredScopes)` — all of a list.

```ts
import { hasPermission } from "cod-shared/rbac/utils";
import { SCOPES } from "cod-shared/rbac/scopes";

if (!hasPermission(user.scopes, SCOPES.ORDERS_CREATE)) throw new PermissionError();
```

> Scopes are **not** enforced here — enforcement lives in the backend's
> RBAC middleware and the dashboard's `requirePermission`. `utils.ts` is the
> shared, pure logic.

---

## Error codes (`errors/`)

A single registry mapping the whole API surface to stable string codes:

- `ERROR_CODES` — every code, grouped by concern (`VALIDATION_FAILED`,
  `INVALID_STATUS_TRANSITION`, `SHIPMENT_CREATION_FAILED`, `INTERNAL_SERVER_ERROR`, …).
- `ErrorCode` — the union type.
- `ERROR_CATEGORIES` / `ErrorCategory` — `VALIDATION`, `AUTHENTICATION`,
  `BUSINESS_LOGIC`, `SYSTEM`.

The backend maps these onto HTTP responses via `cod-server/src/lib/errors`;
the dashboard maps them to UI messages. Keep new codes in sync in both places
— the registry is where they stay consistent.

---

## How the apps consume it

Everything is plain relative imports — no bundler trickery, no publish step:

- **`cod-server`** — `cod-shared/` is in the tsconfig `include`, and
  `src/db/index.ts` / `src/db/schema.ts` re-export the shared client/schema:
  ```ts
  // cod-server/src/db/index.ts
  export * from "../../../cod-shared/db/client";
  ```
- **`cod-client-astro`** — imports `cod-shared/db/client` + `cod-shared/db/schema`
  in the auth surface (`src/lib/auth/server.ts`). All business data goes
  through the cod-server REST API seam (`src/lib/api.ts`), not direct queries.

Both apps also expose convenience aliases (`@/db`, `@/db/schema`) so feature
code rarely imports `cod-shared` paths directly.

---

## Migrations workflow

Migrations are generated and applied **from `cod-server` only** —
`cod-client-astro` shares the same database but owns no migrations.

```bash
# 1. Edit the schema here:  cod-shared/db/schema.ts

# 2. Generate the migration from cod-server
cd cod-server && npm run db:generate

# 3. Apply to the database named by DATABASE_URL
npm run db:migrate
```

See `cod-server/README.md` for the full database section.

---

## Rules & conventions

1. **One source of truth.** Schema, scopes, and shared queries live here — no
   local copies in `cod-server` or `cod-client-astro`.
2. **No build step, no publishing.** Consume via relative imports; never add a
   bundler or make this an npm package.
3. **No environment access.** Queries receive `db` (and any config) as
   arguments; they must never read `env`, globals, or `fetch`.
4. **No external runtime deps** beyond `drizzle-orm`, `pg` and `html-rewriter-wasm`.
5. **Schema changes go through migrations.** Edit `schema.ts`, then generate +
   apply from `cod-server`.
6. **Every exported function is typed.** `AppDb` everywhere, explicit return
   types, no `any`.
