# 07: Channel creation wizard and idempotent creation API

**What to build:** From the channel manager, "Créer un canal de vente" opens a wizard that adapts to the chosen type: type → general information (name, wished subdomain, generated id) → product selection from the catalogue → delivery modes → template → summary → create. Creation generates the channel id, saves its configuration, selections and defaults, gives it a free subdomain, and opens its dashboard. The wizard calls a creation API that is idempotent on a client key, so a retried or resumed creation never makes a second channel; Aventy's own button will call the same API later. A failed step shows a clear error and keeps what was entered.

**Blocked by:** 04, 05, 06

**Status:** ready-for-agent

- [ ] A merchant creates a store channel end to end and lands in its dashboard; it is reachable on its subdomain once published
- [ ] Submitting the same creation twice (double click, network retry) yields one channel
- [ ] A failure mid-way keeps the entered data and can be resumed
- [ ] The creation API is documented as the entry point for Aventy's flow
