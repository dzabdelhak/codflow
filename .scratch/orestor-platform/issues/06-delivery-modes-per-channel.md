# 06: Delivery fees per account, delivery modes per channel

**What to build:** The account holds the delivery grid (home and stop-desk fees per wilaya and office) — the local source Aventy's grid will replace, versioned like the catalogue. Each channel enables the modes it offers; a disabled or unconfigured mode is never shown to the customer. Changing a channel's modes never alters the account grid. Orders record the grid version used.

**Blocked by:** 03

**Status:** done

- [x] Channel A offers home + stop-desk while channel B offers home only, from the same account grid
- [x] A customer never sees a mode the channel disabled
- [x] An order stores the fee shown and the grid version, or the "frais à confirmer" mark
