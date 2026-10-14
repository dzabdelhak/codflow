# Channel design: sections, manifest, editor

A channel's public page is rendered from data, never from a hard-wired
sequence of components (Aventy guide §4.4): a **section-state document** lists
the sections in order, whether each is shown, and their settings, plus the
brand.

```json
{
  "brand": { "logoUrl": null, "primaryColor": "#7c3aed", "accentColor": "#f59e0b", "bgColor": "#f8f8f8", "fontId": "cairo" },
  "sections": [
    { "id": "hero", "type": "hero", "enabled": true,
      "settings": { "heroTitle": { "ar": "…", "fr": "…" }, "heroCtaHref": "/products", "heroImage": "https://…" } }
  ]
}
```

Texts are given per language (`ar`, `fr`, `en`); the storefront uses the
channel's language and falls back to the template's own text when a value is
missing. Links are site-relative (`/…`, `#…`) or http(s); images are http(s).

## Manifest

Each template declares what it can render in
`cod-shared/channels/manifests.ts`: its sections (`essential` ones cannot be
hidden or removed), each section's settings (`text`, `textarea`, `image`,
`url`) and the fonts it allows. `validateDesign`
(`cod-shared/channels/design.ts`) refuses anything the manifest does not
declare — the dashboard editor and, later, Aventy can only send what the
template applies. theme01's `manifest-contracts.test.ts` checks that every
declared section has a renderer and every declared text is a key of its
content packs.

| Template | Sections |
|---|---|
| `theme01` (store) | hero, categories, best_sellers (essential), how_it_works, new_arrivals, features, promo, testimonials |
| `landing01` (landing) | banner, price, order_form (essential); product, gallery, benefits, faq, reassurance |

## Draft, publish, versions

`/api/channel-design` (admin), per active channel:

- `PUT /draft` saves a whole document as the draft (400 with `errors` when it
  does not match the manifest). The public page does not change.
- `POST /publish` makes the draft version N+1 (`channel_design_versions`),
  writes its brand into the channel (`stores` logo, colours, font) and refreshes
  the public pages. A channel never published can publish its template default.
- `DELETE /draft` returns to the last published version; `POST /restore`
  copies an older version into the draft.
- `POST /preview` returns a one-hour token: `https://<hostname>/?preview=<token>`
  renders the draft — even before the channel is published — uncached,
  without tracking pixels, and refuses orders.

A channel with no published version renders its template's default document,
built from its current brand columns. The dashboard's **Design** screen edits
the document with a desktop/mobile preview; Settings no longer edits branding.

## Images

Logo and section images are http(s) addresses for now; uploads come with
ticket 10 (image storage).
