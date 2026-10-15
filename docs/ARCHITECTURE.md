# Orestore Architecture

System map and technical design.

---

## System Overview

```
                ┌────────────────────────────────────────────────────┐
  visitors ────▶│ Caddy — on-demand TLS for merchant domains         │
  merchants     └────┬──────────────────┬──────────────────┬─────────┘
                     │ channel hosts    │ api.<domain>     │ app.<domain>
              ┌──────▼──────┐    ┌──────▼───────┐   ┌──────▼──────────┐
              │ Storefront  │───▶│   Backend    │◀──│   Dashboard     │
              │ (Astro 7)   │API │   (Hono 4)   │JWT│ (Astro 7 +      │
              └─────────────┘    │ + job worker │   │  Better Auth)   │
                                 └──┬────┬────┬─┘   └───┬─────────────┘
          carriers, Meta CAPI ◀─────┘    │    │         │
          (webhooks in, jobs out)        │    │         │
              ┌──────────────────────────▼─┐ ┌▼─────────▼┐ ┌───────────────┐
              │ PostgreSQL (RLS per store) │ │   Redis   │ │ SeaweedFS (S3)│
              │ data + job queue           │ │           │ │ images        │
              └────────────────────────────┘ └───────────┘ └───────────────┘
```

Every service runs in Docker Compose. Only the API reaches SeaweedFS; it
serves images at `/images/<key>?w=<width>`. See
[ADR-0003](./adr/0003-self-hosted-postgres-multi-store.md).

---

## Package Structure

```
codflow-os/
├── cod-shared/         # Shared schema, queries, RBAC scopes
├── cod-server/         # Backend API (Hono on Node.js)
├── cod-client-astro/   # Dashboard (Astro, prerendered + auth server routes)
└── cod-astro/theme01/  # Storefront (Astro SSR, Node adapter)
```

All packages import `cod-shared` via relative paths:
```typescript
import { schema } from "../../cod-shared/db/schema";
import { SCOPES } from "../../cod-shared/rbac/scopes";
```

---

## Tech Stack

| Package | Stack | Runtime |
| :--- | :--- | :--- |
| **cod-astro/theme01** | Astro 7, Tailwind v4 | Node.js |
| **cod-server** | Hono 4, Drizzle ORM, Better Auth (JWT verification) | Node.js + PostgreSQL + Redis + SeaweedFS (S3) |
| **cod-client-astro** | Astro 7 (prerendered), React 19 islands, Better Auth | Node.js + PostgreSQL + Redis |
| **cod-shared** | Drizzle schema, RBAC, errors | Source-shared (no build) |

---

## Data Flow

### Order Lifecycle

```
1. Customer submits order (storefront)
   └─▶ POST /store/orders (cod-server)
       └─▶ Insert into PostgreSQL (the channel's RLS scope)

2. Merchant confirms (dashboard)
   └─▶ PATCH /api/orders/:id
       └─▶ Update status: confirmed

3. Merchant creates shipment
   └─▶ POST /api/delivery/shipments
       └─▶ Call carrier API
       └─▶ Store tracking number

4. Carrier delivers & sends webhook
   └─▶ POST /webhooks/{carrier}
       └─▶ Verify HMAC
       └─▶ Update order: delivered
       └─▶ Queue the conversion jobs (same transaction)

5. The job worker sends each conversion (Meta, TikTok, Snapchat, GA4)
   └─▶ Hash customer PII
   └─▶ POST to the provider, event id = order id
```

---

## Backend (cod-server)

**Framework:** Hono 4 + Zod OpenAPI  
**Database:** Drizzle ORM + PostgreSQL, one transaction per request pinned to
its store by Row-Level Security (`src/db/scope.ts`)  
**Auth:** Better Auth 1.7 with JWT

### Endpoint Organization

```
cod-server/src/
├── endpoints/<domain>/  # Merchant API (/api/*), one folder per domain
├── endpoints/store/     # Storefront API (/store/*)
├── endpoints/webhooks/  # Carrier webhooks
├── endpoints/images/    # Image upload + resized serving (S3 storage)
├── mcp/                 # AI agent API (/mcp)
└── platform/            # Job queue, outbound orders, channel domains, image store
```

### Background jobs

The `jobs` table is the PostgreSQL job queue (`src/platform/jobs.ts`): the
worker started by `src/node.ts` claims due jobs with `FOR UPDATE SKIP LOCKED`,
retries failures with backoff and keeps them across restarts. Server-side
conversions are its first job kind (`src/tracking/`, `docs/TRACKING.md`).

---

## Dashboard (cod-client-astro)

**Framework:** Astro 7 (prerendered static + Node server routes for auth)  
**Rendering:** Pages are prerendered shells; React islands hydrate on the
client and fetch data through the API seam  
**Auth:** Better Auth on the dashboard's server routes (`/api/auth/*`), on
the shared PostgreSQL with Redis as secondary storage; islands carry a short-lived JWT (`set-auth-jwt`) that
cod-server verifies against its JWKS

All dashboard data flows browser → cod-server REST API with JWT
authentication. RBAC is enforced server-side in `cod-server`.


---

## Storefront (cod-astro)

**Framework:** Astro 7 (SSR mode)  
**Rendering:** Server-rendered on-demand  
**JavaScript:** Minimal — only interactive components

All data fetched from the `cod-server` API. No direct database access. One
running storefront serves every channel; the visitor's hostname picks it.

---

## Database Schema

### Core Tables

```
users, accounts, sessions      # Auth
products, variants, offers     # Catalog
orders, order_items            # Orders
customers                      # Customer records
drivers, shipments             # Delivery
wilayas, communes, stop_desks  # 58-wilaya geography
meta_capi_events               # CAPI tracking log
audit_logs                     # Admin actions
```

---

## Authentication

**Better Auth 1.7:**
- Password-based (scrypt hashing)
- JWT tokens (ES256 signing)
- RBAC scopes (defined in `cod-shared/rbac/scopes.ts`)

**Scope enforcement:**
```typescript
const listOrders = defineRoute({
  method: "get",
  path: "/orders",
  auth: { scope: SCOPES.ORDERS_READ },
  handler: handlers.list
});
```

---

## Carrier Integration

All carriers implement the same interface:
```typescript
interface CarrierAdapter {
  createShipment(params): Promise<ShipmentResult>;
  getTracking(trackingNumber): Promise<TrackingStatus>;
  syncStopDesks(wilayaCode?): Promise<StopDesk[]>;
}
```

**Webhooks (Yalidine, ZR Express):**
1. Verify HMAC signature
2. Update order status
3. Queue the conversion jobs

---

## MCP Agent System

AI agents connect via OAuth (RFC 9728 + dynamic client registration); the
dashboard's better-auth OAuth provider is the authorization server:

```
1. Agent discovers the authorization server
   └─▶ GET api/.well-known/oauth-protected-resource/mcp (RFC 9728)
   └─▶ GET app/.well-known/oauth-authorization-server/api/auth

2. Agent registers + authorizes (browser → dashboard)
   └─▶ POST app/api/auth/oauth2/register (DCR) → /oauth2/authorize
        → sign-in → /mcp/channel (pick the channel) → /mcp/consent
        → POST /oauth2/token (JWT access token, store_id claim)

3. Connect to MCP server
   └─▶ POST api/mcp (Streamable HTTP) with the access token

4. Execute tools (orders, products, etc.)
   └─▶ the channel's RLS scope; tools of the granted scopes only
```

Clients, consents and tokens live in PostgreSQL (`oauth*` tables); the MCP
handler itself is stateless. See `docs/MCP.md`.

---

## Deployment

All services run in Docker Compose on one server, behind Caddy:
- **cod-server** → `https://api.<domain>`
- **cod-client-astro** → `https://app.<domain>`
- **cod-astro/theme01** → every channel hostname (merchant domains get their
  certificate on demand)

See [DEPLOYMENT.md](./DEPLOYMENT.md).

---

## Related Docs

- [../puck/README.md](../puck/README.md) — **Start here** for the storefront/theme platform initiative (workspace guide: order of reading, decisions, prohibitions)
- [../puck/PLATFORM-ARCHITECTURE-PLAN.md](../puck/PLATFORM-ARCHITECTURE-PLAN.md) — **Canonical plan** for the storefront/theme platform foundation (contract, sections, composition, phases, proofs)
- [../puck/adr/0002-storefront-theme-platform-foundation.md](../puck/adr/0002-storefront-theme-platform-foundation.md) — Decision record behind the platform plan
- [CONFIGURATION.md](./CONFIGURATION.md) — Environment variables
- [DEPLOYMENT.md](./DEPLOYMENT.md) — Production deployment
