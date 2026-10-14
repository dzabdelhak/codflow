# Known Limitations

Honest list of what needs more testing or improvement.

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
