# 04: Channel lifecycle and publication states

**What to build:** A channel moves through Brouillon → En configuration → Prêt à publier → Publié, and can be Suspendu or Archivé. Only a published channel serves its public pages; a suspended one shows a neutral unavailable page; an archived one is gone from the public web but its orders and logs are kept. The merchant changes status from the channel manager within their permissions; permanent deletion requires confirmation and respects order and log retention. Status changes are logged.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] Public pages answer only for a published channel
- [ ] Suspending a channel takes its storefront offline without losing data; reactivating restores it
- [ ] Archiving keeps orders and logs; deletion asks for confirmation
- [ ] Every status change appears in the channel's activity log with who and when
