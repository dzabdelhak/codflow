# Demo: from Aventy to a live channel

What to show Aventy: a merchant clicks one button in Aventy, lands in our
creation wizard with their Aventy products already there, and a few minutes
later has a store or a landing page online.

## Before the demo

```sh
docker compose up -d --build
```

- **Aventy (mock):** http://aventy.localhost:8090 — a mock of Aventy's seller space, labelled as a mock.
- **Dashboard:** http://app.localhost:8090
- **Stores:** `http://<subdomain>.localhost:8090`

Needs internet: the product photos and fonts load from Unsplash and Google Fonts.

Each run needs a merchant that does not exist yet. On the Aventy page, change
both the shop name and the email (for example "Maison Sara",
`sara@example.com`). The shop name gives the merchant's Aventy reference, and
an email already used by another merchant is refused.

## The flow (about 5 minutes)

1. **Aventy.** Show the seller space: the products, the « Vendez sur votre
   propre boutique » card. Click **Créer un canal de vente**.
2. **Signed in, no password.** The dashboard opens on « Créer un canal de
   vente », signed in as the merchant. The banner says the Aventy products are
   in the catalogue. Switch the language to Français or العربية from the top
   bar if needed.
3. **Type.** Choose **Boutique en ligne** (several products) or **Landing
   page** (one product).
4. **Informations.** The name comes from Aventy, and the address follows it
   (`<name>.localhost`). Optionally enter the merchant's own domain
   (`www.maison-sara.dz`); it is added as pending until its DNS points at us.
5. **Produits.** The Aventy products, with photos and the « Aventy » badge.
   Tick several for a store, or one for a landing page.
6. **Livraison.** Home delivery and stop desk. Fees come from Aventy's grid,
   imported with the catalogue (58 wilayas).
7. **Template.** Three store templates (Boutique classique, Boutique mode,
   High-tech) and two landing templates (Page produit, Offre flash), each with
   its own colours, font, section order and texts in three languages.
8. **Récapitulatif → Créer la boutique**, then **Mettre en ligne
   maintenant**, then **Ouvrir la boutique**. The channel is live on its
   address.

Products cannot be created or edited in Orestor: open **Produits** to show the notice ("Vos produits sont gérés dans Aventy"), no "Ajouter un produit" button and read-only product pages. The merchant only chooses what each store shows.

A good pairing: a **High-tech** store with the headphones, watches and
earbuds, then an **Offre flash** landing page for the noise-cancelling
headphones.

## AI through MCP

The platform has no built-in page generator. Its AI side is MCP: an AI agent
(Claude) connected to a channel works through the same API and permissions as
the dashboard. What it can do today that suits this demo:

- **Write product copy.** `updateProductDetails` changes the product
  description, which shows on product pages and in a landing channel's product
  section.
- **Build an image landing page.** `createLandingPage`, `uploadLandingPageImage`
  (from image addresses), `reorderLandingPageImages` and `publishLandingPage`
  build a page at `/lp/<slug>` on a store channel.

1. Dashboard → **Agents IA**: connect Claude to the channel (OAuth, choose
   the channel).
2. Ask, for example:
   - « Rédige une description vendeuse du casque Bluetooth, en arabe et en français, et enregistre-la » — then reload the landing page;
   - « Crée une landing page pour la montre connectée avec ces images, puis publie-la ».

The sections of a channel's design (titles, benefits, FAQ) have no MCP tool
yet; they are edited in the Design screen. Rehearse this part on the laptop
before the meeting: it needs the MCP connection to reach
`http://api.localhost:8090/mcp`.

## What is real and what is mocked

| Real (production code) | Mocked for the demo |
|---|---|
| Signed one-time link (HMAC, 5 min, single use), merchant and admin created on first use, session | Aventy's page (`demo/aventy/server.mjs`) |
| Creation wizard and the single creation API (`POST /api/merchant/stores`, idempotent) | The Aventy catalogue and delivery grid (`AVENTY_DEMO=1`, `cod-server/src/aventy/demo-client.ts`) |
| Versioned catalogue copies (`aventy_id`, `source_version`), the same code as the channel sync | |
| Templates, own domain (pending until DNS), publishing, storefront | |
| Per-channel Aventy keys (encrypted), sync engine, order sending with revoked-key handling: tested against an in-memory Aventy | The HTTP client: waits for Aventy's API reference |

What we need from Aventy to plug in for real: the API reference (endpoints,
auth, payloads), a demo store with test keys, and agreement on the link's
claims and how the secret is shared (`docs/AVENTY-CONNECTOR.md`).
