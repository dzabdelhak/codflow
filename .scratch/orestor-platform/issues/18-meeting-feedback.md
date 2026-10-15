# 18: Meeting feedback (Oct 15 2026)

**What to build:** The corrections from the meeting with Aventy. Interface: the domain field is "Domain Name", the create button says "Créer un canal", and Aventy merchants no longer see Clients, Livraison and Équipe (managed in Aventy; their delivery grid and team are locked like the catalogue). A channel's template can be changed after creation. New channels start with the cart on; an abandoned cart can be turned into an order from the dashboard. The order form asks for one "full name" or a first and last name, and the merchant picks which optional fields it shows. A Messenger chat button, like the WhatsApp one.

**Blocked by:** 07, 08, 15

**Status:** in progress

Decisions: hiding and locking apply to Aventy merchants only; orders gain `customer_first_name` / `customer_last_name`; stores gain `messenger_widget_json`.

- [x] 1.1 The domain field reads "Domain Name" (ar/fr/en)
- [x] 1.2 The create button reads "+ Créer un canal"
- [x] 1.3 Aventy merchants see neither Clients nor Livraison; their delivery grid is read-only
- [ ] 1.4 A channel's template can be changed from the Design screen, as a draft to preview and publish
- [x] 2.1 A store channel starts with the cart on
- [ ] 2.2 An abandoned cart becomes an order (priced, stock-checked, sent) from the abandoned carts screen
- [x] 3.1 Aventy merchants manage their team in Aventy: Équipe is hidden, members come in through Aventy's button
- [ ] 3.2 The order form asks for one full name or first + last name, and the merchant chooses its optional fields
- [ ] 4.1 A Messenger chat button on the store, set up in the dashboard
