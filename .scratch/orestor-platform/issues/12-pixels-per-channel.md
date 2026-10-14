# 12: Pixels and server-side events per channel

**What to build:** Each channel configures its own Meta, TikTok, Snap, GA4 and Google Ads tracking, with identifiers checked where the provider allows and a test/diagnostic view. Storefront and landing events (page view, product view, add to cart, checkout start, order submitted) fire in the browser; conversion events also go server-side through a PostgreSQL job queue with per-job locking (replacing the CAPI Workflow), deduplicated so a conversion is never counted twice. UTM parameters are kept on the session and the order. Consent handling follows the policy Aventy's legal team defines.

**Blocked by:** 02

**Status:** done

- [x] Two channels of one account fire to their own pixel ids only
- [x] An order produces one conversion per platform even when browser and server both send it
- [x] UTMs captured on landing are stored on the order
- [x] Server-side events survive an app restart (queued in PostgreSQL); no Workflow code remains
