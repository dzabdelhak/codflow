# Known Limitations

Honest list of what needs more testing or improvement.

---

## Platform Constraints

### Cloudflare Workers

- **Worker↔Worker on workers.dev blocked** — Both storefront and backend cannot be on `*.workers.dev`. Deploy at least one to a custom domain.
- **D1 single-region** — Database is in one region, not globally distributed.
- **D1 is beta** — No full-text search, limited storage (2GB free / 10GB paid).

---

## Not Fully Tested

### Server-side conversions

⚠️ **Not production-tested** — the conversion jobs (Meta, TikTok, Snapchat, GA4) are tested against faked provider APIs and checked locally against the real endpoints with test credentials, but have not been verified with real ad accounts in production.

### Carrier Integrations

**Yalidine & ZR Express:**
- Webhook handlers exist with HMAC verification
- Need more real-world testing and improvements

**NOEST & EcoTrack:**
- API integration exists
- No webhook support — tracking must be polled manually
