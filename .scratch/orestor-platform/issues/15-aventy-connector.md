# 15: Aventy connector (catalogue, delivery, orders, identity)

**What to build:** Plug Aventy into both seams once its API reference, demo store and test keys arrive: one key per channel, encrypted at rest with the encryption key outside the database; catalogue, delivery and section snapshots + changes + one-minute heartbeat (one locked scheduled job polling for every channel); orders delivered to Aventy with its five answer kinds (guide §5.3); revoked key stops sending and alerts without losing the queue; Aventy SSO for merchant login; the signed one-time token for creating a channel from Aventy's button.

**Blocked by:** 14, 05, 06, 07, 09 — and Aventy's API reference (needs-info)

**Status:** needs-info

- [ ] Channel creation from Aventy's button works through the signed token with no inbound call required
- [ ] A price change in Aventy reaches the channel within a heartbeat, replacing the copy only when the version is newer
- [ ] Orders appear in Aventy's demo store with the channel's identity; resends never duplicate
- [ ] Merchants sign in with their Aventy account
- [ ] The Aventy key never appears in the browser, URLs or logs
