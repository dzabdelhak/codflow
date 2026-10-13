# 02: A visitor places a COD order that is queued for transmission

**What to build:** On a seeded channel a visitor fills the checkout and gets the confirmation page. The order, its lines and its outbound queue entry (ULID send id, payload per guide §5.2) commit in one transaction. Order numbers are readable, prefixed per channel, and can never collide. Following guide rules 1 and 3, the order is taken even when stock is uncertain (the customer sees "stock non garanti, confirmé à l'appel" before validating) or no delivery fee is known ("frais à confirmer", never 0 DA). Concurrent buyers of the last unit are handled with row locks (spike finding: PostgreSQL is READ COMMITTED where a D1 batch was serial).

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] A checkout on a channel creates the order and exactly one queue entry in the same transaction; a failure leaves neither
- [ ] 300 orders placed in a burst all succeed with distinct order numbers carrying the channel prefix
- [ ] With no delivery fee configured the order is accepted and marked "frais à confirmer"; the customer is never shown 0 DA
- [ ] Short stock does not refuse the order; the customer sees the not-guaranteed notice before validating
- [ ] Two concurrent buyers of the last unit never produce a silent oversell (the guarded stock writes lock their rows)
- [ ] Checkout and cart tests run on PostgreSQL
