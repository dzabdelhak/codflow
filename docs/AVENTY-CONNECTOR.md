# Aventy connector

What the platform does today for a channel fed by Aventy, and what waits for
Aventy's API reference. The contract is [AVENTY-INTEGRATION.md](./AVENTY-INTEGRATION.md).

## Built

**One key per channel (guide §3).**
- **Where it's managed:** Settings → Aventy (`PUT`/`DELETE /api/aventy/key`, admins). The key is stored in `channel_aventy_keys`.
- **Encryption:** AES-256-GCM, with the channel id as authenticated data, so a ciphertext copied to another channel cannot be opened.
- **The encryption key:** `AVENTY_KEY_ENCRYPTION_KEY`, kept in the deployment's secrets, never in the database. To rotate it, move the old value to `AVENTY_KEY_ENCRYPTION_KEY_PREVIOUS`; each key is re-sealed with the new value on its next use.
- **What leaves the server:** responses show only `••••` + the last four characters. Errors and logs replace the key with `••••` (`redactKey`).
- **Platform without the encryption key:** it refuses to store a key (422 `AVENTY_NOT_CONFIGURED`).

**Pulling changes (guide §4.1).**
- **Heartbeat:** `task:aventy-heartbeat` runs once a minute across all servers (`src/platform/schedule.ts`) and asks every channel with an active key which domains changed.
- **Catalogue:** the first pull is a snapshot; after that, changes from the stored cursor. A cursor that is too old falls back to a snapshot. A snapshot unpublishes the channel's Aventy products it no longer lists.
- **Delivery:** the whole grid is pulled whenever it changed.
- **Applied in chunks:** products are applied 200 per transaction, under the channel's RLS scope; the cursor is saved only by the last transaction, so a run cut short resumes from the old cursor (`src/aventy/sync.ts`).
- **One sync per channel:** an advisory lock lets only one sync run per channel at a time, even when two heartbeats overlap.

**Versioned copies.**
- **Products:** an Aventy product is a catalogue row with `aventy_id` and Aventy's version in `source_version`, apart from the local `version` that the trigger raises on every update. A copy is replaced only by a newer version.
- **Variants, categories and images:**
  - variants are matched by their full reference (SKU);
  - categories by `aventy_id`;
  - images keep Aventy's URLs.
- **Withdrawals:** a product Aventy withdraws is unpublished in that channel, never deleted.
- **Delivery grid:** each channel's grid becomes its own shipping profile (`shipping_profiles.aventy_store_id`, `source_version`) and the channel's default profile.
- **Orders:** an order sends Aventy's versions back (guide §5.2): `lines[].catalogVersion` and `delivery.gridVersion`.

**Permissions.** A domain the key does not grant is skipped and recorded ("does not grant this domain"); the other domains keep syncing. Settings → Aventy shows each domain's last sync and last error.

**Orders and a revoked key (guide §5.3, §6).**
- **Destination:** with `ORDER_DESTINATION=aventy`, the destination looks up the order's channel key and sends the order with its ULID send id. A resend is answered "already received" with the same Aventy id.
- **Revoked key:** when Aventy refuses a key (here or in the heartbeat), the key is marked revoked. That channel's entries stay in the queue; the outbound worker skips the channel, and its attempts are not counted, so the channel's creation order holds.
- **Alerts:** the dashboard banner and the transmission screen show an alert when the key is revoked, or missing while orders go to Aventy.
- **Resuming:** saving a new key resumes sending at once.

**From Aventy's button (guide: channel creation).**
- **The link:** Aventy signs `base64url(claims).base64url(HMAC-SHA256)` with the secret it shares with the platform (`AVENTY_LINK_SECRET`, on the dashboard). Claims: `ref` (the merchant's Aventy reference, `[A-Za-z0-9_-]{1,64}`), `shop`, `email`, `name`, `iat`, `exp`, `jti`. A link lives at most five minutes (`cod-shared/aventy/link-token.ts`).
- **The entry:** `GET /api/auth/aventy/enter?token=…` on the dashboard (`cod-client-astro/src/lib/auth/aventy-entry.ts`). It checks the signature and expiry, uses the `jti` once (Redis), creates the merchant `aventy-<ref>` and its admin user on first use (no password: they come in from Aventy), opens a session and redirects to the creation wizard. A refused link lands on the sign-in page with the reason. No call back to Aventy is needed.
- **The catalogue:** the wizard, when opened from the link, calls `POST /api/aventy/catalogue/import`, which copies the merchant's Aventy products into its catalogue (published in no channel until the merchant picks them) and, when the account has no delivery grid yet, Aventy's grid as its default profile. Any other merchant answers `linked: false`, and so does a client without `merchantSnapshot` (the real client, until Aventy says how a merchant's catalogue is read before it has a channel key).

**Demo mode.** `AVENTY_DEMO=1` (cod-server; refused at start when `ENVIRONMENT=production`) uses an in-process Aventy (`src/aventy/demo-client.ts`): eleven products with photos, a 58-wilaya grid, orders accepted. `docker compose up` runs it with a mock of Aventy's seller space at http://aventy.localhost:8090 (`demo/aventy/server.mjs`), whose button signs the link. The script is `docs/DEMO-AVENTY.md`.

## Known limit

- **Link in the address bar:** the signed link carries the merchant's email (base64, not encrypted) in the URL, so it can reach proxy logs; it is single-use and short-lived. A form POST would keep it out of URLs.
- **One copy per product:** the copy lives in the merchant's one catalogue, so two Aventy channels of the same merchant share it. Price, reserve and description are those of the most recent version either channel received. If Aventy's sites can price or stock the same product differently, these need to move per channel (a schema change, to decide with Aventy's reference).

## Waiting for Aventy

These need Aventy's API reference, demo store and test keys:

- **The HTTP client:** `aventyClientFromEnv` returns `null` until the endpoints, authentication and payloads are known. It must implement `AventyClient` (`src/aventy/client.ts`): heartbeat, catalogue snapshot and changes, delivery grid, send order. It throws `AventyUnauthorizedError` for a refused key and `AventyPermissionError` for a domain the key does not grant, and maps Aventy's five answers onto the destination answers. Until it exists, the heartbeat is not scheduled and `ORDER_DESTINATION=aventy` refuses to start.
- **Sections and publishing** pulled from Aventy (guide §4.4), applied as the channel's section-state document ([CHANNEL-DESIGN.md](./CHANNEL-DESIGN.md)).
- **The signed link's final shape:** the entry above follows our proposal; Aventy confirms the claims, the secret exchange, and whether it sends the link as a GET or a form POST.
- **Merchant sign-in with an Aventy account** (SSO) other than through the button; the merchant's catalogue before any channel exists (`merchantSnapshot`, implemented only by the demo client).
- **The optional "something changed" signal** from Aventy (the heartbeat already covers it).

The tests run against an in-memory Aventy (`src/test-utils/fake-aventy.ts`). Once the real client exists, it should pass the same scenarios (`src/aventy/aventy-e2e.test.ts`).
