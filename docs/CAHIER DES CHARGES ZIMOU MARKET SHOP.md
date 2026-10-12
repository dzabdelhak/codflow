# **CAHIER DES CHARGES FONCTIONNEL**

## **ZIMOU MARKET — Boutique e-commerce**

**Client :** ZIMOU STUDIO  
**Nom du projet :** ZIMOU MARKET  
**Secteur :** Mode / Beauté  
**Marché cible :** Algérie  
**Type de projet :** Boutique e-commerce  
**Version :** V1 — Spécification fonctionnelle

---

# **1\. Présentation du projet**

ZIMOU MARKET est une boutique en ligne destinée au marché algérien.

La plateforme doit permettre aux visiteurs de consulter le catalogue, rechercher des produits, sélectionner leurs variantes, ajouter des produits au panier, passer une commande et suivre son évolution.

Un espace d'administration permettra à l'équipe ZIMOU MARKET de gérer les produits, catégories, marques, stocks, commandes, livraisons, promotions, contenus, utilisateurs et statistiques.

L'architecture devra être conçue de manière évolutive afin de permettre l'ajout ultérieur de nouvelles fonctionnalités.

---

# **2\. Objectifs fonctionnels**

La plateforme devra permettre de :

* Présenter les produits de manière professionnelle.  
* Organiser les produits par catégories et marques.  
* Rechercher et filtrer les produits.  
* Gérer les variantes des produits.  
* Ajouter des produits au panier.  
* Passer une commande rapidement.  
* Proposer la livraison à domicile ou en point relais / Stopdesk.  
* Gérer les 58 wilayas et leurs communes.  
* Calculer automatiquement les frais de livraison.  
* Intégrer Yalidine et ZIMOU EXPRESS.  
* Gérer les commandes depuis l'administration.  
* Gérer les stocks.  
* Gérer les promotions et codes promotionnels.  
* Gérer les utilisateurs et leurs permissions.  
* Suivre les performances commerciales.  
* Être optimisée pour mobile.  
* Être optimisée pour le référencement naturel.

---

# **3\. Architecture générale**

La plateforme sera composée de deux espaces principaux :

## **3.1 Front-office**

Accessible aux visiteurs et clients :

* Accueil  
* Catalogue  
* Catégories  
* Marques  
* Fiche produit  
* Panier  
* Passage de commande  
* Confirmation de commande  
* Suivi de commande  
* Compte client  
* Pages institutionnelles

## **3.2 Back-office**

Accessible aux utilisateurs autorisés :

* Dashboard  
* Commandes  
* Produits  
* Catégories  
* Marques  
* Stocks  
* Livraisons  
* Promotions  
* Utilisateurs internes  
* Avis clients  
* Contenus  
* Statistiques  
* Marketing

---

# **4\. Accueil**

La page d'accueil devra présenter :

* Logo  
* Menu principal  
* Barre de recherche  
* Panier  
* Bannière principale  
* Catégories principales  
* Sous-catégories  
* Produits populaires  
* Nouveautés  
* Promotions  
* Produits recommandés  
* Informations sur la livraison  
* Modes de paiement  
* Réseaux sociaux  
* Footer

Le footer devra inclure les informations légales et commerciales de l'entreprise.

---

# **5\. Catalogue produits**

La page catalogue devra permettre :

* Affichage des produits sous forme de grille.  
* Pagination ou chargement dynamique.  
* Filtrage par catégorie.  
* Filtrage par prix.  
* Filtrage par disponibilité.  
* Filtrage par attribut.  
* Filtrage par marque.


### **Tri**

* Nouveautés  
* Popularité

---

# **6\. Fiche produit**

Chaque produit devra comporter :

* Nom  
* Photos  
* Galerie d'images  
* Prix  
* Ancien prix en cas de promotion  
* Description  
* Caractéristiques  
* Disponibilité  
* Référence / SKU  
* Marque  
* Variantes  
* Informations de livraison  
* Bouton « Ajouter au panier »  
* Bouton « Acheter maintenant »

Le formulaire de commande rapide pourra également être accessible directement depuis la fiche produit.

## **6.1 Variantes**

Exemple pour un vêtement :

**Couleur :**

* Noir  
* Blanc  
* Beige

**Taille :**

* S  
* M  
* L  
* XL

Chaque combinaison de variantes pourra avoir :

* Un prix spécifique  
* Une image spécifique  
* Une référence spécifique

---

# **7\. Panier**

Le panier devra afficher :

| Élément | Information |
| ----- | ----- |
| Produit | Nom \+ image |
| Variante | Taille / couleur |
| Quantité | \+/- |
| Prix unitaire | Prix |
| Sous-total | Calcul automatique |
| Livraison | Frais |
| Total | Montant final  |
| Code promo | Réduction sur la totalité  |

### **Actions**

* Modifier la quantité  
* Supprimer un produit  
* Vider le panier  
* Continuer les achats

Le système devra empêcher la commande d'une quantité supérieure au stock disponible.

activer ou désactiver cette option par l'admin 

---

# **8\. Passage de commande**

Le checkout doit être conçu pour être simple et rapide.

## **8.1 Informations client**

* Nom \*  
* Prénom   
* Téléphone \*  
* Wilaya \*  
* Commune  
* Adresse  
* Note / commentaire

## **8.2 Livraison**

Options :

* Livraison à domicile  
* Livraison en point relais / Stopdesk

Le système devra déterminer les options disponibles en fonction de la wilaya / commune sélectionnée.

## **8.3 Paiement**

V1 :

* Paiement à la livraison

Optionnel / évolutif : v2

* Paiement en ligne

## **8.4 Récapitulatif**

Avant validation :

* Produits  
* Quantités  
* Sous-total  
* Frais de livraison  
* Total  
* Informations client  
* Mode de livraison  
* Mode de paiement

after that we show client thankyou page 

---

# **9\. Protection contre les commandes abusives**

Le système devra prévoir des mécanismes permettant de limiter :

* Les doubles commandes accidentelles.  
* Les soumissions multiples du formulaire.  
* Les commandes frauduleuses.  
* Les commandes répétitives suspectes.

Exemples de mécanismes :

* Désactivation temporaire du bouton après soumission.  
* Identifiant unique de commande.  
* Détection des doublons.  
* Vérification du numéro de téléphone.  
* Historique des commandes liées à un même numéro.  
* Possibilité pour l'administrateur de bloquer un client / numéro.

---

# **10\. récapitulatif & thank you page**

Après validation, afficher une page de confirmation.

Informations :

* Numéro de commande  
* Produits  
* Total  
* Mode de livraison  
* Adresse  
* Téléphone  
* Statut initial

Exemple :

**Commande \#CMD-10254**

**Statut : Commande reçue**

---

# **11\. Suivi de commande**

Le client pourra chercher sa commande avec :

* Numéro de commande  
* Numéro de téléphone

### **Statuts**

1. À confirmer  
2. Confirmée  
3. En préparation  
4. Expédiée  
5. En livraison  
6. Livrée  
7. Annulée  
8. Retour  
9. Échec de livraison  
10. ajouter autre perso 

---

# **12\. Gestion des utilisateurs et des rôles**

Cette section est obligatoire pour le back-office.

La plateforme devra distinguer :

1. **Clients**  
2. **Administrateurs internes**  
3. **Utilisateurs avec permissions limitées**

## **12.1 Gestion des utilisateurs internes**

Un administrateur autorisé pourra :

* Créer un utilisateur.  
* Modifier un utilisateur.  
* Désactiver un utilisateur.  
* Réactiver un utilisateur.  
* créer les role  
* Attribuer un rôle.  
* Modifier les permissions.  
* Consulter la dernière connexion.  
* Consulter l'activité de l'utilisateur.

### **Informations utilisateur**

* Nom  
* Prénom  
* Email / identifiant  
* Téléphone — optionnel  
* Rôle  
* Statut  
* Date de création  
* Dernière connexion

---

## **12.2 Rôles**

Le système devra prévoir une gestion par rôles.

### **Super Administrateur**

Accès complet :

* Utilisateurs  
* Permissions  
* Produits  
* Commandes  
* Stocks  
* Livraisons  
* Promotions  
* Clients  
* Statistiques  
* Paramètres  
* Contenus

Il pourra également créer et modifier les rôles.

### **Administrateur**

Accès à la majorité des fonctionnalités opérationnelles.

Exemple :

* Produits  
* Commandes  
* Stocks  
* Livraisons  
* Clients  
* Promotions  
* Statistiques

Sans accès aux paramètres critiques et à la gestion du Super Administrateur.

### **Gestionnaire de commandes**

Accès :

* Consultation des commandes  
* Modification du statut  
* Modification des informations client  
* Préparation des commandes  
* Gestion de la livraison  
* Impression des bordereaux

Pas d'accès :

* Paramètres système  
* Utilisateurs  
* Gestion des permissions  
* Suppression des produits

### **Gestionnaire de stock**

Accès :

* Consultation des produits  
* Gestion du stock  
* Entrées  
* Sorties  
* Ajustements  
* Historique des mouvements  
* Alertes de stock

### **Gestionnaire marketing**

Accès :

* Promotions  
* Codes promo  
* Bannières  
* Contenus marketing  
* Avis clients

---

## **12.3 Permissions granulaires**

Le système devra idéalement permettre de gérer les permissions indépendamment du rôle.

Exemples :

| Module | Voir | Créer | Modifier | Supprimer |
| ----- | ----- | ----- | ----- | ----- |
| Produits | ✓ | ✓ | ✓ | ✓ |
| Commandes | ✓ | ✓ | ✓ | — |
| Stock | ✓ | ✓ | ✓ | — |
| Catégories | ✓ | ✓ | ✓ | ✓ |
| Marques | ✓ | ✓ | ✓ | ✓ |
| Promotions | ✓ | ✓ | ✓ | ✓ |
| Clients | ✓ | — | ✓ | — |
| Utilisateurs | ✓ | ✓ | ✓ | ✓ |
| Statistiques | ✓ | — | — | — |
| Paramètres | ✓ | — | ✓ | — |

Les permissions exactes seront définies lors de l'implémentation.

---

# **13\. Gestion des clients**

L'administrateur pourra :

* Consulter les clients.  
* Rechercher un client.  
* Filtrer les clients.  
* Consulter l'historique des commandes.  
* Consulter le nombre de commandes.  
* Consulter le montant total commandé.  
* Consulter les commandes annulées / échouées.  
* Bloquer / débloquer un numéro ou un compte si nécessaire.

---

# **14\. Gestion des produits**

L'administrateur pourra :

* Ajouter un produit.  
* Modifier un produit.  
* Désactiver un produit.  
* Supprimer un produit.  
* Dupliquer un produit.

### **Informations**

* Nom  
* Description courte  
* Description complète  
* Prix  
* Prix promotionnel  
* SKU  
* Catégorie  
* Sous-catégorie  
* Marque  
* Images  
* Vidéo — optionnel  
* Stock  
* Seuil d'alerte  
* Variantes  
* Poids  
* Dimensions  
* SEO  
* Pixel / tracking

---

# **15\. Gestion des catégories**

L'administrateur pourra :

* Créer une catégorie.  
* Modifier une catégorie.  
* Désactiver une catégorie.  
* Supprimer une catégorie.  
* Réorganiser les catégories.  
* Créer des sous-catégories.

---

# **16\. Gestion des marques**

L'administrateur pourra :

* Créer une marque.  
* Modifier une marque.  
* Désactiver une marque.  
* Supprimer une marque.  
* Ajouter un logo.  
* Ajouter une description.

---

# **17\. Gestion du stock**

Le système devra permettre :

* Suivi du stock en temps réel.  
* Entrées de stock.  
* Sorties de stock.  
* Ajustement manuel.  
* Historique des mouvements.  
* Alertes de stock faible.  
* Gestion des ruptures.

Exemple :

**Sneakers X**

Stock initial : 50  
Commande : \-2  
Stock restant : **48**

Les mouvements de stock devront être historisés.

---

# **18\. Gestion des commandes**

L'administrateur pourra :

* Consulter les commandes.  
* Rechercher une commande.  
* Filtrer par statut.  
* Filtrer par date.  
* Filtrer par wilaya.  
* Filtrer par société de livraison.  
* Modifier le statut.  
* Modifier les informations client.  
* Ajouter une note interne.  
* Annuler une commande.  
* Imprimer les bordereaux.  
* Exporter les commandes.

### **Formats d'export**

* Excel  
* PDF

---

# **19\. Gestion de la livraison**

Le système devra permettre de configurer les frais de livraison.

Exemple :

| Wilaya | Domicile | Stopdesk |
| ----- | ----- | ----- |
| Alger | 500 DA | 400 DA |
| Blida | 600 DA | 500 DA |
| Oran | 700 DA | 600 DA |
| Constantine | 800 DA | 700 DA |

## **Sociétés intégrées en V1**

* Yalidine  
* ZIMOU EXPRESS

### **Fonctionnalités**

* Création d'expédition.  
* Génération du numéro de suivi.  
* Récupération du statut.  
* Mise à jour automatique de la commande.  
* Gestion des erreurs d'expédition.

Les intégrations devront être conçues de manière indépendante afin de permettre l'ajout ultérieur d'autres transporteurs.

---

# **20\. Promotions**

## **Promotion produit**

Exemple :

**5 000 DA → 3 990 DA**

## **Code promotionnel**

Exemple :

**WELCOME10**

Paramètres :

* Pourcentage ou montant fixe  
* Minimum de commande  
* Date de début  
* Date de fin  
* Nombre maximum d'utilisations  
* Produits concernés  
* Catégories concernées  
* Statut actif / inactif

---

# **21\. Recherche**

La recherche devra pouvoir utiliser :

* Nom  
* SKU / référence  
* Catégorie  
* Marque  
* Attribut

Exemple :

**« Nike Air »**

→ Afficher les produits correspondants.

---

# **22\. Avis clients**

Fonctionnalité prévue mais désactivable.

Le client pourra :

* Donner une note.  
* Écrire un commentaire.  
* Ajouter une photo.

L'administrateur pourra :

* Valider.  
* Refuser.  
* Masquer.  
* Supprimer un avis.

---

# **23\. SEO**

Chaque produit devra pouvoir disposer de :

* Meta title  
* Meta description  
* URL personnalisée  
* Texte alternatif des images

Le site devra respecter :

* Structure H1 / H2 / H3  
* Sitemap  
* URLs propres  
* Optimisation mobile  
* Optimisation des performances

---

# **24\. Responsive Design**

La boutique devra être compatible avec :

* Desktop  
* Laptop  
* Tablet  
* Smartphone

La conception devra être **Mobile First**, notamment pour les visiteurs provenant des réseaux sociaux.

---

# **25\. Réseaux sociaux**

Intégration / liens :

* Facebook  
* Instagram  
* TikTok  
* Snapchat  
* WhatsApp 

Possibilité de partager les produits sur les réseaux sociaux. 

---

# **26\. Notifications**

## **Notifications administrateur**

* Nouvelle commande  
* Commande annulée  
* Stock faible


---

# **27\. Sécurité**

La plateforme devra assurer :

* HTTPS.  
* Authentification sécurisée.  
* Gestion des rôles et permissions.  
* Protection des comptes administrateurs.  
* Protection des données clients.  
* Protection contre les accès non autorisés.  
* Gestion des sessions.  
* Sauvegardes régulières.  
* Journalisation des actions sensibles.  
* Protection contre les doubles soumissions.  
* Protection contre les commandes abusives.

Les données sensibles ne devront pas être exposées côté client.

---

# **28\. Performance**

Objectifs :

* Chargement rapide.  
* Images optimisées.  
* Lazy loading.  
* Cache.  
* Optimisation mobile.  
* Optimisation des requêtes.  
* Réduction des ressources inutiles.

---

# **29\. Statistiques et reporting**

Le dashboard devra afficher :

* Chiffre d'affaires  
* Nombre de commandes  
* Nombre de produits vendus  
* Panier moyen  
* Taux de conversion  
* Produits les plus vendus  
* Produits les moins vendus  
* CA par période  
* CA par produit  
* CA par catégorie  
* Commandes par wilaya  
* Commandes par statut  
* Taux d'annulation  
* Taux de confirmation  
* Taux d'échec de livraison

---

# **30\. Intégrations**

## **V1**

* Yalidine  
* ZIMOU EXPRESS  
* Google Analytics  
* Pixel  
* WhatsApp / Messenger widget

## **Évolutif**

* Google Sheets  
* Autres société de livraison   
* Passerelle de paiement  
* CRM  
* ERP

---

# **31\. Administration des contenus**

L'administrateur pourra gérer :

* Bannières  
* Pages  
* Menus  
* Catégories  
* Produits  
* Promotions  
* FAQ  
* Conditions générales  
* Politique de confidentialité  
* Informations de contact  
* Réseaux sociaux

---

# **32\. Règles métier principales**

Les règles suivantes devront être respectées :

### **Stock**

Un produit ne pourra pas être commandé si la quantité demandée dépasse le stock disponible.   (l’admin peut activer / desactiver cette option )

### **Livraison**

Les frais de livraison devront être calculés selon la zone et le mode de livraison sélectionnés.

### **Commandes**

Chaque commande devra disposer d'un identifiant unique.

### **Promotions**

Une promotion expirée ou désactivée ne devra plus être appliquée.

### **Permissions**

Un utilisateur ne devra pouvoir accéder qu'aux modules autorisés par son rôle / ses permissions.

---

# **33\. Responsive & UX**

La priorité de conception sera :

**Mobile → Tablet → Desktop**

Les parcours prioritaires seront :

1. Arrivée depuis une publicité / réseau social.  
2. Consultation produit.  
3. Sélection variante.  
4. remplir le formulaire.  
5. Commander.  
6. Confirmation.  
7. Suivi.

Le nombre d'étapes du checkout devra être réduit au minimum.

---

# **34\. Livrables**

À la fin du projet :

* Boutique en ligne fonctionnelle.  
* Interface administrateur.  
* Système de gestion des utilisateurs.  
* Système de rôles et permissions.  
* Base de données.  
* Gestion des produits.  
* Gestion des stocks.  
* Gestion des commandes.  
* Gestion de la livraison.  
* Intégrations Yalidine / ZIMOU EXPRESS.  
* Configuration du nom de domaine.  
* Hébergement.  
* Certificat SSL.  
* Responsive design.  
* Documentation technique / administrateur.  
* Mise en production.

---

# **35\. Périmètre V1 / Évolutions**

Les fonctionnalités suivantes pourront être développées dans une version ultérieure :

* Abandon de panier. ( a faire v1)

* Paiement en ligne.  
* Programme de fidélité.  
* Notifications avancées. (clients)  
* Application mobile.  
* Marketplace multi-vendeurs.  
* Automatisation marketing avancée.

---

# 

# 

# 

# 

# 

# 

# 

# 

# 

# 

# 

# 

# 

