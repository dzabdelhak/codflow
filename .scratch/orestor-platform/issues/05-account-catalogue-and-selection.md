# 05: Account catalogue and per-channel product selection

**What to build:** Products, variants, images and categories belong to the account, edited in the dashboard as today — this is the local catalogue source that Aventy's will replace. Each channel selects which catalogue products it carries, which are published, which are featured on its home page, and their display order. The four states (in catalogue / associated / published / featured) are visible at a glance. Catalogue rows carry a version so a later Aventy sync can replace them by version. Removing or hiding a product in one channel never touches the catalogue or other channels.

**Blocked by:** 03

**Status:** done

- [x] A product created once in the catalogue can be added to two channels and shown in both
- [x] Hiding it in channel A leaves it visible in channel B and in the catalogue
- [x] The storefront shows only published products of its channel, in the chosen order, featured ones on the home page
- [x] Prices shown and charged come from the catalogue; a channel cannot override them
- [x] Every catalogue row has a version that increases on change
