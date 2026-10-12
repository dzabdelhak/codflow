# CAHIER DES CHARGES FONCTIONNEL & TECHNIQUE

## ZIMOU MARKET — Boutique e-commerce connectée à Aventy ERP

**Client :** ZIMOU STUDIO  
**Nom du projet :** ZIMOU MARKET  
**Type de projet :** Boutique e-commerce connectée à un ERP existant  
**Marché cible :** Algérie  
**Version :** V2 — Spécification fonctionnelle pour démarrage du développement  
**Destinataires :** Équipe DevOps, développeurs Front-end, Back-end et intégration API

---

# 1. Présentation du projet

ZIMOU MARKET est une boutique e-commerce destinée au marché algérien. Elle sera développée pour fonctionner en connexion avec Aventy ERP, qui constitue le système central de gestion commerciale et opérationnelle.

L'objectif est de permettre à un commerçant de gérer son catalogue dans Aventy, de sélectionner les produits qu'il souhaite afficher sur sa boutique, de recevoir les commandes des clients sur le site et de synchroniser automatiquement ces commandes vers Aventy.

La boutique disposera d'un back-office simplifié, consacré uniquement aux fonctionnalités spécifiques au site e-commerce : personnalisation du template, configuration de la boutique, sélection des produits à afficher, consultation et export des commandes, connexion à Aventy, configuration des pixels publicitaires et création ou gestion des landing pages.

Les fonctionnalités de gestion déjà couvertes par Aventy ne doivent pas être développées une seconde fois dans ZIMOU MARKET.

## 1.1 Objectifs principaux

* Développer une boutique moderne, responsive et optimisée pour la conversion.
* Connecter la boutique à Aventy ERP.
* Synchroniser les produits depuis Aventy vers la boutique.
* Permettre de choisir les produits visibles sur l'accueil et dans le store.
* Transmettre automatiquement les nouvelles commandes à Aventy.
* Simplifier le back-office de la boutique.
* Permettre l'export des commandes.
* Configurer les pixels publicitaires et les outils de suivi.
* Créer et gérer des landing pages commerciales.
* Prévoir une architecture évolutive, sécurisée et maintenable.

---

# 2. Principe d'architecture et répartition des responsabilités

## 2.1 Aventy ERP : système central

Aventy doit rester la source de référence pour les données et opérations suivantes :

* Création et modification des produits.
* Références SKU, prix et informations du catalogue.
* Variantes des produits, selon les données disponibles dans Aventy.
* Stock et disponibilité.
* Gestion opérationnelle des commandes.
* Gestion des clients dans le cadre des opérations ERP.
* Confirmation, traitement et suivi opérationnel des commandes.
* Gestion des transporteurs et des opérations de livraison.
* Gestion des agents, équipes et permissions ERP.
* Gestion des modules opérationnels déjà disponibles dans Aventy.

Toute modification d'une donnée gérée par Aventy devra être effectuée dans Aventy, puis répercutée sur la boutique selon les règles de synchronisation définies.

## 2.2 ZIMOU MARKET : interface e-commerce

La boutique prend en charge :

* L'affichage public des produits sélectionnés.
* L'accueil, les catégories visibles et les pages du site.
* Les templates et paramètres visuels.
* Le panier et le parcours de commande.
* La collecte des informations nécessaires à la commande.
* La transmission des commandes à Aventy.
* La consultation et l'export des commandes reçues.
* La configuration du domaine, du SEO et des réseaux sociaux.
* La configuration des pixels et des outils d'analytics.
* La création et la gestion des landing pages, selon le périmètre retenu.
* Les paramètres propres au fonctionnement de la boutique.

## 2.3 Règle de non-duplication

Toute fonctionnalité déjà disponible dans Aventy et relevant de la gestion ERP doit être exclue du back-office de ZIMOU MARKET, sauf besoin spécifique clairement validé.

Le développement ne doit pas recréer un second système de gestion des produits, des stocks, des transporteurs, des agents ou du traitement opérationnel des commandes.

---

# 3. Périmètre fonctionnel du projet

Le projet est organisé autour de six modules :

1. Front-office de la boutique.
2. Connexion et synchronisation avec Aventy.
3. Back-office simplifié de la boutique.
4. Gestion de l'affichage du catalogue et du template.
5. Landing pages et outils marketing.
6. Export des commandes, sécurité, déploiement.

---

# 4. Module 1 — Front-office de la boutique

## 4.1 Page d'accueil

L'accueil devra être personnalisable depuis le back-office.

Éléments prévus :

* Logo de la boutique.
* Menu de navigation.
* Barre de recherche.
* Bannière principale.
* Catégories mises en avant.
* Produits sélectionnés par l'administrateur.
* Nouveautés et promotions lorsque les données correspondantes existent dans Aventy.
* Sections personnalisables selon le template.
* Informations de livraison et de paiement.
* Liens vers les réseaux sociaux.
* Footer avec les informations légales et commerciales.

L'administrateur doit pouvoir choisir les produits à mettre en avant et organiser leur ordre d'affichage, sans modifier les données commerciales sources dans Aventy.

## 4.2 Catalogue public

Le catalogue public affichera uniquement les produits :

* synchronisés depuis Aventy ;
* autorisés à être publiés sur la boutique ;
* sélectionnés ou rendus visibles selon les règles de publication ;
* compatibles avec les conditions de disponibilité définies pour le projet.

Fonctionnalités :

* Affichage en grille.
* Recherche par nom ou référence, selon les données synchronisées.
* Filtrage par catégorie, marque, prix ou attribut, lorsque ces données sont disponibles.
* Tri par nouveauté et prix.
* Pagination ou chargement progressif.
* Affichage d'un message adapté lorsqu'aucun produit ne correspond à la recherche.

## 4.3 Fiche produit

Chaque fiche affichera les informations disponibles et autorisées dans Aventy :

* Nom du produit.
* Images et galerie.
* Description courte et complète.
* Prix de vente.
* Prix promotionnel si disponible.
* Référence SKU.
* Catégorie et marque.
* Variantes disponibles.
* Disponibilité du produit.
* Sélection de quantité.
* Boutons « Ajouter au panier » et « Acheter maintenant ».
* Informations utiles sur la livraison et le paiement.

Les variantes, images, prix et disponibilités devront correspondre aux données synchronisées. Le système ne devra pas créer localement des valeurs commerciales contradictoires avec Aventy.

## 4.4 Panier

Le panier devra permettre :

* L'ajout de produits et variantes.
* La modification des quantités.
* La suppression d'un article.
* L'affichage des prix unitaires et du sous-total.
* Le calcul du total de la commande.
* La vérification des données de prix et de disponibilité avant validation.

Les prix transmis au serveur devront être vérifiés à partir des données de référence. Le navigateur ne doit jamais être considéré comme une source fiable pour le prix final.

## 4.5 Passage de commande

Le parcours de commande devra être simple, rapide et optimisé pour les smartphones.

Champs à prévoir :

* Nom complet : obligatoire.
* Numéro de téléphone : obligatoire.
* Wilaya : obligatoire.
* Commune : selon les exigences du parcours.
* Adresse : selon les exigences du mode de livraison.
* Note ou commentaire : facultatif.
* Produits, variantes et quantités.
* Mode de livraison disponible.
* Récapitulatif du montant final.

Le paiement à la livraison sera le mode prévu pour la V1. Le paiement en ligne n'est pas inclus dans le périmètre initial.

Les frais de livraison devront être calculés selon les données et règles validées pour l'intégration. Si Aventy expose les informations nécessaires, elles devront être réutilisées plutôt que recréées dans la boutique.

## 4.6 Confirmation de commande

Après validation, afficher une page de confirmation contenant :

* Numéro de commande de la boutique.
* Référence de la commande dans Aventy, lorsqu'elle a été créée.
* Produits et quantités.
* Total de la commande.
* Informations de livraison.
* Confirmation de réception de la demande.

---

# 5. Module 2 — Connexion et synchronisation Aventy

Cette intégration constitue la fonctionnalité centrale du projet.

## 5.1 Paramètres de connexion

Le back-office devra disposer d'une section « Connexion Aventy ».

Fonctionnalités :

* Activer ou désactiver la connexion.
* Configurer les informations de connexion autorisées.
* Renseigner l'URL de l'API ou l'environnement concerné, selon l'architecture Aventy.
* Configurer le mécanisme d'authentification.
* Tester la connexion.
* Afficher le statut de connexion.
* Afficher la date de la dernière synchronisation réussie.
* Consulter les erreurs récentes.
* Relancer une synchronisation en échec lorsque cela est autorisé.

Les identifiants et jetons d'accès devront être conservés côté serveur, chiffrés ou protégés selon les standards retenus. Ils ne devront jamais être exposés dans le navigateur.

## 5.2 Synchronisation du catalogue Aventy vers la boutique

Le catalogue sera créé et géré dans Aventy.

Le back-office de ZIMOU MARKET devra permettre de :

* Récupérer la liste des produits disponibles dans Aventy.
* Rechercher un produit par nom ou SKU.
* Consulter les informations utiles à sa publication.
* Sélectionner ou désélectionner un produit pour la boutique.
* Sélectionner les produits à mettre en avant sur l'accueil.
* Définir l'ordre d'affichage des produits sélectionnés.
* Organiser leur présentation dans les sections du template.

La sélection d'un produit pour la boutique ne devra pas modifier son statut commercial ou son stock dans Aventy.

### Données à synchroniser

Selon les champs réellement exposés par l'API Aventy :

* Identifiant unique du produit dans Aventy.
* Nom et SKU.
* Description.
* Images.
* Prix de vente.
* Prix promotionnel, si disponible.
* Catégorie et marque.
* Variantes et attributs.
* Disponibilité ou quantité de stock, si autorisée.
* Statut actif/inactif.
* Date de dernière mise à jour.

La correspondance entre les identifiants Aventy et ceux de la boutique devra être conservée afin d'éviter la création de produits en double.

### Règles de synchronisation

* Une modification d'un produit dans Aventy doit être répercutée sur la boutique.
* Un produit désactivé dans Aventy ne doit plus pouvoir être commandé sur la boutique. (hors stock / inactif selon le choix de client)
* Un produit retiré de l'affichage de la boutique ne doit pas être supprimé d'Aventy.
* Les erreurs de synchronisation doivent être enregistrées et consultables.
* La synchronisation ne doit pas écraser les réglages propres au template, tels que l'ordre d'affichage ou la sélection sur l'accueil.
* Le mécanisme de synchronisation devra prévoir une actualisation automatique et une action manuelle si l'API le permet.

La fréquence, les webhooks disponibles et les règles exactes de disponibilité devront être confirmés avec l'équipe Aventy.

---

# 6. Module 3 — Transmission automatique des commandes à Aventy

## 6.1 Fonctionnement attendu

Lorsqu'un client valide une commande sur ZIMOU MARKET :

1. Le serveur valide les champs obligatoires.
2. Il vérifie les produits, variantes, quantités et prix.
3. Il attribue un identifiant unique à la commande de la boutique.
4. Il enregistre la demande de commande de manière fiable.
5. Il transmet la commande à Aventy.
6. Il récupère et enregistre la référence ERP si la création est confirmée.
7. Il affiche le résultat de la transmission dans le back-office.
8. Il permet une nouvelle tentative en cas d'échec technique, sans créer de doublon.

## 6.2 Données transmises

Le payload devra inclure, selon les champs requis par Aventy :

* Identifiant de commande de la boutique.
* Date de création.
* Nom du client.
* Téléphone.
* Adresse.
* Wilaya et commune.
* Mode de livraison.
* Produits identifiés par leur référence Aventy ou SKU reconnu.
* Variantes, si prises en charge. (sous sku)
* Quantités.
* Prix et totaux validés.
* Note du client.
* Source de la commande : ZIMOU MARKET.
* URL ou identifiant de la landing page, si applicable.
* Paramètres d'attribution marketing disponibles.

Les données obligatoires et leur format devront être alignés sur le contrat d'API Aventy. Aucun champ ne doit être supposé disponible sans validation technique.

## 6.3 Statuts de synchronisation

La boutique devra distinguer le statut commercial de la commande et le statut technique de synchronisation.

Statuts techniques recommandés :

* En attente de synchronisation.
* En cours de transmission.
* Synchronisée avec succès.
* Échec de synchronisation.
* Nouvelle tentative programmée.
* Intervention requise.

Les statuts opérationnels tels que « Confirmée », « Expédiée » ou « Livrée » restent pilotés par Aventy.

## 6.4 Gestion des erreurs et des doublons

Le système devra :

* Empêcher les doubles soumissions du formulaire.
* Utiliser une clé d'idempotence ou un mécanisme équivalent, si pris en charge.
* Conserver l'identifiant de commande de la boutique.
* Conserver la référence Aventy.
* Journaliser les erreurs et les réponses utiles de l'API, sans enregistrer de secrets.
* Prévoir des tentatives automatiques avec délai progressif.
* Permettre une reprise contrôlée des commandes en échec.
* Éviter toute recréation automatique d'une commande déjà acceptée par Aventy.
* Alerter l'administrateur si une intervention est nécessaire.

Une commande en échec de transmission ne doit pas disparaître. Elle doit rester visible jusqu'à sa résolution.

---

# 7. Module 4 — Back-office simplifié de ZIMOU MARKET

Le back-office ne doit contenir que les options nécessaires à la gestion de la boutique.

## 7.1 Tableau de bord

Indicateurs recommandés :

* Nombre de commandes reçues.
* Commandes synchronisées avec Aventy.
* Commandes en attente de synchronisation.
* Commandes en échec de synchronisation.
* Dernière synchronisation.
* Produits actuellement publiés sur la boutique.
* Nombre de landing pages publiées.
* Accès rapides vers les paramètres de la boutique et les exports.

Les indicateurs commerciaux détaillés et les analyses opérationnelles devront être repris d'Aventy lorsque disponibles, au lieu de développer un second système analytique complet.

## 7.2 Gestion des commandes

La boutique permettra de :

* Consulter la liste des commandes reçues sur le site.
* Rechercher par numéro de commande, client ou téléphone.
* Filtrer par période.
* Filtrer par statut de synchronisation.
* Consulter le détail d'une commande.
* Afficher la référence Aventy associée.
* Consulter l'historique de transmission.
* Exporter les commandes sélectionnées ou filtrées.

La modification opérationnelle des commandes, l'affectation aux agents, la confirmation commerciale, la gestion de l'expédition et les opérations de livraison restent dans Aventy.

Le back-office de ZIMOU MARKET ne doit pas devenir un deuxième écran de traitement complet des commandes.

## 7.3 Gestion des utilisateurs de la boutique

Prévoir une gestion simple des accès au back-office :

* Super administrateur.
* Administrateur de la boutique.
* Gestionnaire marketing, si nécessaire.

Permissions minimales :

* Consultation des commandes.
* Export des commandes.
* Gestion de la sélection des produits et de l'accueil.
* Gestion des templates et contenus.
* Gestion des landing pages.
* Configuration des pixels.
* Gestion de la connexion Aventy.
* Gestion des utilisateurs.

Les paramètres sensibles de connexion devront être réservés aux utilisateurs autorisés. La gestion des agents opérationnels et leurs permissions ERP ne doit pas être dupliquée dans la boutique.

---

# 8. Module 5 — Paramètres de la boutique et du template

## 8.1 Informations générales

Le back-office devra permettre de configurer :

* Nom de la boutique.
* Logo.
* Favicon.
* Coordonnées et informations commerciales.
* Numéro WhatsApp.
* Liens Facebook, Instagram, TikTok et autres réseaux.
* Langue principale.
* Devise affichée : DA.
* Informations du footer.
* Pages légales et politique de confidentialité.

## 8.2 Personnalisation du template

L'administrateur pourra modifier les éléments visuels autorisés par le template :

* Couleurs principales et secondaires.
* Typographies disponibles.
* Logo et favicon.
* Bannière principale.
* Images des sections.
* Textes et boutons.
* Ordre des sections.
* Catégories mises en avant.
* Produits mis en avant.
* Affichage ou masquage de certaines sections.
* Liens de navigation.
* Footer.

La personnalisation devra s'effectuer depuis le back-office, sans modification du code source pour les changements courants.

## 8.3 Gestion des pages

Prévoir la gestion des pages de contenu nécessaires :

* À propos.
* Contact.
* FAQ.
* Conditions générales de vente.
* Politique de confidentialité.
* Politique de livraison et de retour.
* Autres pages configurables.

## 8.4 Domaine et référencement

Prévoir :

* Configuration du domaine de la boutique.
* Gestion du titre SEO et de la méta-description.
* URLs propres.
* Gestion des balises H1, H2 et H3.
* Textes alternatifs des images.
* Sitemap XML.
* Redirections lors de changements d'URL, si nécessaire.
* Aperçu des métadonnées de partage social.

Le développement devra prévoir le HTTPS et une configuration correcte du domaine en production.

---

# 9. Module 6 — Export des commandes

L'export est une fonctionnalité obligatoire du back-office.

## 9.1 Formats

* Excel (.xlsx).
* CSV.
* PDF.
* Google Sheets, si une intégration autorisée est retenue.

L'export Google Sheets pourra être réalisé dans une phase distincte si l'authentification et l'accès à l'API Google ne sont pas disponibles dans la V1.

## 9.2 Filtres avant export

L'utilisateur autorisé devra pouvoir sélectionner :

* Une période.
* Un ou plusieurs statuts de synchronisation.
* Les commandes synchronisées ou non synchronisées.
* Une sélection manuelle de commandes.

## 9.3 Données exportées

Selon les droits de l'utilisateur et les données disponibles :

* Identifiant de commande de la boutique.
* Référence Aventy.
* Date de commande.
* Nom du client.
* Téléphone.
* Wilaya.
* Commune.
* Adresse.
* Produits.
* Références SKU.
* Variantes.
* Quantités.
* Prix unitaires.
* Total de la commande.
* Mode de livraison.
* Statut de synchronisation.
* Source ou landing page, si disponible.

L'export doit respecter les filtres actifs, présenter les colonnes de manière lisible et éviter l'exposition de données personnelles à des utilisateurs non autorisés.

---

# 10. Module 7 — Pixels publicitaires et analytics

Le back-office devra proposer une section « Tracking & Pixels ».

## 10.1 Paramètres à prévoir

* Meta Pixel ID.
* TikTok Pixel ID.
* Snap Pixel ID.
* Google Analytics 4 Measurement ID.
* Google Ads ID.
* Google Ads Conversion Label.
* Champs additionnels pour les paramètres de tracking autorisés.
* Activation ou désactivation de chaque intégration.

Les identifiants seront stockés dans les paramètres de la boutique et utilisés côté client uniquement lorsque cela est nécessaire et autorisé.

## 10.2 Événements à suivre

Prévoir, selon les capacités des plateformes :

* PageView.
* ViewContent.
* Search.
* AddToCart.
* InitiateCheckout.
* AddPaymentInfo, si applicable.
* Purchase, uniquement lorsque la commande a été validée selon la règle métier définie.

Le système doit éviter de compter plusieurs fois une même conversion en raison d'un rafraîchissement de page ou d'une nouvelle tentative technique.

## 10.3 Attribution des campagnes

La boutique devra conserver les paramètres UTM pertinents au cours du parcours d'achat et les associer à la commande transmise à Aventy, lorsque le schéma d'API le permet.

Paramètres à prévoir :

* utm_source.
* utm_medium.
* utm_campaign.
* utm_content.
* utm_term, si utilisé.
* Identifiants publicitaires disponibles.

Les informations d'attribution devront être conservées sans altérer le contenu de la commande.

Les règles de consentement applicables aux cookies et au tracking devront être définies avant la mise en production.

---

# 11. Module 8 — Landing pages

La boutique devra permettre la création et la gestion de landing pages destinées aux campagnes publicitaires et à la vente d'un produit.

**Point d'architecture important :** Aventy possède déjà un module de landing pages comprenant la génération, l'édition, la publication, les formulaires de commande, le SEO et les pixels. Avant de développer un nouveau constructeur, l'équipe devra décider si ZIMOU MARKET réutilise ce module, s'y connecte ou possède un module distinct. Le but est d'éviter deux systèmes de landing pages indépendants et difficiles à synchroniser.

## 11.1 Fonctionnalités attendues

* Créer une landing page.
* Choisir un produit du catalogue Aventy ou créer une page sans produit associé.
* Définir un titre et une description.
* Configurer l'objectif de la page.
* Sélectionner un modèle ou une structure.
* Modifier les blocs de contenu autorisés.
* Ajouter images et vidéos.
* Modifier les boutons et appels à l'action.
* Ajouter une FAQ et des témoignages lorsque disponibles.
* Configurer une offre ou plusieurs options d'achat.
* Prévisualiser la page avant publication.
* Publier, dépublier, dupliquer et archiver une page.
* Copier son URL publique.
* Modifier le SEO et les paramètres de partage social.
* Consulter le nombre de commandes associées, si le suivi est disponible.

## 11.2 Blocs de contenu

Le constructeur devra prévoir, selon le modèle retenu :

* Hero / bannière principale.
* Texte.
* Image.
* Galerie.
* Caractéristiques et bénéfices.
* Témoignages.
* Offre commerciale.
* Bouton d'action.
* Formulaire de commande.
* FAQ.
* Footer.

## 11.3 Formulaire de commande

Le formulaire devra être relié au même mécanisme de transmission des commandes à Aventy que le checkout principal.

Les données devront inclure :

* Informations du client.
* Produit et variante éventuelle.
* Quantité.
* Offre sélectionnée.
* Prix et total.
* Identifiant de la landing page.
* Paramètres UTM et source publicitaire lorsqu'ils existent.

Les prix, références et disponibilités d'un produit lié au catalogue devront être validés à partir des données de référence. Les commandes générées par une landing page devront suivre les mêmes règles de fiabilité et de prévention des doublons.

## 11.4 Paramètres marketing des landing pages

Prévoir les champs de configuration nécessaires :

* Meta Pixel.
* TikTok Pixel.
* Snap Pixel.
* Google Analytics 4.
* Google Ads et libellé de conversion.
* Titre SEO.
* Description SEO.
* URL publique.
* Paramètres visuels du modèle.

Les possibilités exactes devront dépendre du choix d'intégration avec le module de landing pages Aventy.

---

# 12. Fonctionnalités explicitement exclues du back-office de la boutique

Afin de réduire les coûts, les délais et la duplication fonctionnelle, les modules suivants ne devront pas être développés dans ZIMOU MARKET :

* Création complète des produits.
* Modification des prix commerciaux sources.
* Gestion indépendante des stocks.
* Gestion des mouvements de stock.
* Gestion des fournisseurs.
* Gestion de la caisse et des dépenses.
* Gestion financière et comptable.
* Gestion complète des clients ERP.
* Gestion des agents de confirmation.
* Affectation des commandes aux agents.
* Gestion opérationnelle des statuts de commande.
* Gestion des transporteurs et de leurs identifiants API.
* Gestion des expéditions et du dispatch.
* Gestion des statistiques de performance des agents.
* Gestion des commissions et rémunérations des agents.
* Gestion des opérations ERP déjà existantes.

Ces fonctions restent dans Aventy, sauf décision expresse et documentée de l'équipe projet.

---

# 13. Exigences techniques et DevOps

## 13.1 Architecture

L'équipe devra proposer une architecture permettant :

* Une séparation claire entre front-office, back-office et intégration ERP.
* Une API sécurisée entre la boutique et Aventy.
* Une séparation entre données synchronisées et paramètres propres à la boutique.
* La gestion des environnements de développement, de test et de production.
* L'évolution future des templates et fonctionnalités marketing sans refonte du système de synchronisation.

Le choix du framework, de la base de données et de l'infrastructure reste à valider par l'équipe technique.

## 13.2 Fiabilité de la synchronisation

Le système devra prévoir :

* Des appels API avec gestion des délais d'attente.
* Des erreurs structurées et journalisées.
* Des tentatives automatiques contrôlées.
* Une file de traitement si nécessaire.
* Une stratégie de reprise après indisponibilité d'Aventy.
* Une prévention des doublons.
* Une surveillance de l'état de synchronisation.
* Un moyen de relancer les opérations en échec sans perdre les commandes.

## 13.3 Sécurité

* HTTPS obligatoire.
* Authentification sécurisée au back-office.
* Gestion des rôles et permissions.
* Protection contre les accès non autorisés.
* Protection des formulaires et des API.
* Validation côté serveur.
* Protection contre les doubles soumissions.
* Journalisation des actions sensibles.
* Sauvegardes régulières.
* Gestion sécurisée des secrets et tokens.
* Limitation de l'accès aux données personnelles.
* Aucun secret d'API dans le code JavaScript livré au navigateur.

## 13.4 Performance

* Approche mobile-first.
* Optimisation des images.
* Chargement différé lorsque pertinent.
* Mise en cache contrôlée.
* Optimisation des requêtes.
* Chargement rapide du catalogue.
* Gestion correcte des erreurs réseau.
* Tests de performance avant mise en production.

## 13.5 Déploiement et supervision

Livrables DevOps attendus :

* Configuration des environnements.
* Configuration du domaine et du HTTPS.
* Variables d'environnement sécurisées.
* Procédure de déploiement.
* Stratégie de retour à une version précédente.
* Sauvegardes et procédure de restauration.
* Logs applicatifs.
* Surveillance des erreurs et des synchronisations.
* Alertes en cas d'échec répété de transmission des commandes.
* Documentation d'exploitation.

---

# 14. Critères d'acceptation fonctionnelle

La V1 sera considérée comme prête lorsque les tests suivants seront concluants.

## 14.1 Catalogue

* Un produit créé dans Aventy peut être récupéré par la boutique.
* Un produit sélectionné peut être affiché sur l'accueil.
* Les informations commerciales correspondent aux données sources.
* Un produit désactivé dans Aventy ne peut plus être commandé.
* La sélection d'affichage ne modifie pas les données sources de l'ERP.

## 14.2 Commandes

* Une commande valide depuis la boutique est enregistrée et transmise à Aventy.
* La référence Aventy est conservée après confirmation de création.
* Une erreur API est visible dans le back-office.
* Une commande en échec peut être reprise.
* Une nouvelle tentative ne crée pas de doublon.
* Les commandes issues des landing pages suivent le même processus.

## 14.3 Exports

* L'utilisateur peut exporter les commandes en Excel, CSV et PDF.
* Les filtres appliqués sont respectés.
* Les colonnes correspondent aux données disponibles.
* Les permissions et la confidentialité sont respectées.

## 14.4 Template et paramètres

* Les changements de logo, couleurs, bannière et produits mis en avant sont visibles sur le site.
* Les pages de contenu sont administrables.
* Les réglages SEO sont appliqués aux pages concernées.
* Le site est fonctionnel sur mobile, tablette et ordinateur.

## 14.5 Pixels et landing pages

* Les identifiants de tracking peuvent être configurés.
* Les événements de conversion sont déclenchés conformément aux règles définies.
* Les pages peuvent être prévisualisées et publiées.
* Une commande issue d'une landing page conserve son origine lorsque les données sont disponibles.
* Les informations commerciales des produits liés restent cohérentes avec Aventy.

## 14.6 Sécurité et exploitation

* Les secrets ne sont pas exposés au navigateur.
* Les utilisateurs ne peuvent accéder qu'aux fonctions autorisées.
* Les erreurs sont journalisées.
* Les sauvegardes et la restauration sont documentées.
* Le déploiement de production est reproductible.

---

# 15. Phasage recommandé

## Phase 0 — Validation technique

* Vérifier les endpoints de l'API Aventy.
* Confirmer les droits et le mécanisme d'authentification.
* Définir le mapping des produits, variantes, stocks et commandes.
* Définir la méthode de synchronisation et la prévention des doublons.
* Décider de la réutilisation ou non du module de landing pages Aventy.
* Valider les règles de livraison et les données de checkout.

## Phase 1 — Socle e-commerce et intégration

* Front-office responsive.
* Catalogue synchronisé depuis Aventy.
* Sélection des produits à afficher.
* Fiches produits, panier et checkout.
* Création et transmission des commandes.
* Suivi technique des synchronisations.
* Back-office simplifié.
* Export des commandes.
* Paramètres de boutique et de template.
* Configuration du domaine, sécurité et déploiement.

## Phase 2 — Marketing et landing pages

* Pixels et analytics.
* Paramètres UTM.
* Gestion ou intégration des landing pages.
* Association des commandes à leur page ou source.
* Amélioration des outils d'export et de suivi des campagnes.

Les phases pourront être ajustées après validation de la faisabilité de l'API et du module de landing pages existant.

---

# 16. Questions à trancher avant le démarrage du développement

1. **API Aventy :** quels endpoints permettent de lire les produits, récupérer les variantes, vérifier la disponibilité, créer une commande et récupérer son statut ?
2. **Synchronisation :** Aventy dispose-t-il de webhooks pour notifier les changements de catalogue et de statut, ou faut-il utiliser une synchronisation périodique ?
3. **Prix et stock :** la boutique doit-elle interroger Aventy au moment du checkout ou utiliser des données synchronisées avec une fréquence définie ?
4. **Livraison :** les frais et options de livraison doivent-ils être calculés via Aventy ou par un mécanisme propre à la boutique ?
5. **Landing pages :** le module existant d'Aventy peut-il être réutilisé directement ou faut-il développer un module indépendant connecté au catalogue et aux commandes ?
6. **Google Sheets :** souhaite-t-on une exportation manuelle, une synchronisation automatique ou les deux ?
7. **Utilisateurs :** la boutique sera-t-elle utilisée par un seul commerçant ou devra-t-elle gérer plusieurs boutiques ?

---

# 17. Livrables attendus

À la fin du projet, l'équipe devra livrer :

* Boutique e-commerce fonctionnelle.
* Back-office simplifié.
* Connexion sécurisée à Aventy.
* Synchronisation du catalogue.
* Transmission fiable des commandes.
* Gestion des erreurs et reprise des synchronisations.
* Export des commandes.
* Paramètres de boutique et personnalisation du template.
* Configuration des pixels et du tracking.
* Fonctionnalité de création ou d'intégration des landing pages selon le choix technique validé.
* Environnements et pipeline de déploiement.
* Configuration du domaine name
* Documentation d'exploitation et de déploiement.

---

# Conclusion

ZIMOU MARKET doit être conçu comme une couche e-commerce connectée à Aventy, et non comme un ERP supplémentaire.

La priorité du développement est de garantir la fiabilité du catalogue synchronisé, la transmission des commandes sans doublons, la simplicité du back-office et la maîtrise des paramètres marketing.

Toute fonctionnalité de gestion déjà disponible dans Aventy devra être réutilisée lorsque c'est techniquement possible. Cette approche réduit la duplication, facilite la maintenance et permet de concentrer les ressources de développement sur l'expérience client, le template, les landing pages et la conversion commerciale.

---

# MODULE — FONCTIONNALITÉS INNOVANTES ET OPTIMISATION E-COMMERCE

## 1. Objectif

La boutique ZIMOU MARKET devra intégrer progressivement des fonctionnalités modernes visant à améliorer l'expérience utilisateur, augmenter le taux de conversion, faciliter la création de contenu et optimiser les performances commerciales.

Ces fonctionnalités devront respecter l'architecture existante : Aventy ERP demeure la source de référence pour les produits, les prix, les variantes, les stocks et les commandes opérationnelles.

## 2. Intelligence artificielle

Le système devra permettre l'intégration progressive des fonctionnalités suivantes :

* **Assistant d'achat IA :** comprendre les demandes des visiteurs et proposer des produits présents dans le catalogue synchronisé. (répondre selon une base de connaissance / macros)
* **Recherche intelligente :** interpréter les requêtes naturelles, les synonymes et les fautes de frappe. Recherche par image.
* **Génération de contenu :** proposer des descriptions produit, des titres SEO et des textes marketing en français, arabe et darja algérienne…
* **Recommandations personnalisées :** proposer des produits similaires ou complémentaires selon les règles commerciales et les données disponibles.
* **Assistant IA du commerçant :** analyser les indicateurs de la boutique et suggérer des améliorations. Diriger l'assistant à faire des tâches quotidiennes (changement couleur / autres tâches).

Les contenus générés par IA devront être validés par un utilisateur habilité avant publication. L'IA ne devra pas inventer les prix, la disponibilité, les caractéristiques des produits ou les conditions de livraison.

## 3. Conversion et expérience utilisateur

Le système devra prévoir :

* Un checkout mobile-first avec commande sans création obligatoire de compte.
* Des recommandations complémentaires et des offres groupées configurables.
* Les favoris et le partage de panier.
* La gestion des paniers abandonnés et des relances autorisées.
* L'affichage des avis clients vérifiés, lorsque le module est disponible.

## 4. Marketing et optimisation

La boutique devra permettre :

* La création et la personnalisation de landing pages.
* La configuration des pixels publicitaires et des outils d'analyse.
* La conservation des paramètres UTM et des informations d'attribution lorsqu'ils sont disponibles.
* La réalisation de tests A/B sur les éléments de conversion.
* La génération assistée de textes publicitaires et de contenus de campagne.

## 5. Sécurité, données et intégration

* Les prix, stocks, variantes et données opérationnelles devront rester sous le contrôle d'Aventy.
* Toute commande devra conserver un identifiant unique permettant d'éviter les doublons lors des synchronisations et des nouvelles tentatives.
* Les fonctionnalités IA devront respecter les permissions, la confidentialité des données et les limites d'accès au catalogue.
* Les cookies et traceurs non essentiels devront respecter les exigences applicables en matière de consentement.
