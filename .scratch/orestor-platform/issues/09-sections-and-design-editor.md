# 09: Pages from section data, template manifest, design editor

**What to build:** Public pages are rendered from a versioned list of sections and their settings, never from hard-wired component sequences. Each template publishes a manifest of the sections it can render and their settings (guide §4.4). In the channel dashboard the merchant edits logo, colours, allowed fonts, banners, texts and images, CTAs, and the order and visibility of sections; saves a draft; previews desktop and mobile; and publishes. The editor writes the same section-state document Aventy would send, so either can own design later (open question in the spec). Essential components cannot be removed.

**Blocked by:** 04

**Status:** done

- [x] The theme renders a channel's home page entirely from its section-state document
- [x] Each template exposes a manifest; the editor offers only what the manifest declares
- [x] Draft changes are invisible publicly until published; previewing shows desktop and mobile
- [x] Publishing bumps the section-state version and can return to the last published version
