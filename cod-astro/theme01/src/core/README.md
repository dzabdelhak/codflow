# Core Layer

⚠️ **DO NOT MODIFY FILES IN THIS DIRECTORY** ⚠️

This directory contains the core engine logic that powers the Orestore integration. Modifying these files will break the integration with the Orestore backend and may cause order processing failures.

## What's in the Core Layer?

The core layer contains all business logic, API integration, and data validation:

### `actions/`
Astro actions for form submissions with input validation. The `placeOrder` action handles order submission with Zod schema validation.

### `api/`
- `client.ts` - All HTTP communication with the Orestore backend
- `types.ts` - TypeScript interfaces for API data structures
- `validation.ts` - Zod schemas for runtime data validation

### `data/`
- `wilayas.ts` - Algeria's 58 wilayas (provinces) reference data

### `endpoints/`
Server-side API endpoints that proxy requests to the Orestore backend:
- `communes.ts` - Returns communes for a wilaya (keeps API key server-side)
- `submit-review.ts` - Handles review submission
- `product-reviews.ts` - Returns reviews for a product

### `middleware.ts`
Implements the POST/Redirect/GET pattern for Astro actions, handling form submissions and error redirects.

### `utils/`
- `image-optimizer.ts` - resized-image URLs from cod-server's `/images`
  pipeline (`optimizeImage`, `getCardImage`, `getGalleryImage`,
  `getThumbnailImage`, `getHeroImage`, `getCategoryImage`, `getLogoImage`).
  Active only when the optional `MEDIA_URL` env var is set;
  `media-image-service.ts` applies the same rule to every `<Image>`.

> Astro requires actions and middleware in `src/`, so two proxy files at the
> package root re-export from here: `src/actions/index.ts` → `@/core/actions`,
> and `src/middleware.ts` → `@/core/middleware`. Treat those proxies as part of
> the core layer — don't move logic into them.

## Why Can't I Modify Core Files?

The core layer is tightly integrated with the Orestore backend API. Changes to:
- API endpoints or request formats will cause 400/500 errors
- Validation schemas will cause order submission failures
- Type definitions will cause runtime errors
- Middleware logic will break form submissions

## What Should I Customize Instead?

All customization should happen in the **Theme Layer** (`src/theme/`):
- 🟢 Components - Modify HTML structure and styling
- 🟢 Layouts - Change page layouts
- 🟢 Styles - Update colors, fonts, spacing
- 🟢 Scripts - Modify client-side interactions
- 🟢 Config - Change default store settings and UI text

See `src/theme/README.md` for customization guidance.

## Import Paths

Core files should be imported using the `@/core/*` path alias:

```typescript
import { fetchProducts } from "@/core/api/client";
import type { Product } from "@/core/api/types";
import { WILAYAS } from "@/core/data/wilayas";
```
