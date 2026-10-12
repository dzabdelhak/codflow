# Aventy — guide d'intégration pour l'équipe plateforme

Oct 8, 2026 · @Nazim

Vous construisez la plateforme de landing pages et de boutiques reliée à Aventy. Ce guide fixe les règles de la liaison : vous pouvez concevoir toute votre architecture dès aujourd'hui, avant même de recevoir la référence technique.

## 0. Ce que contient ce guide

Ce guide décrit le contrat de liaison. Il suffit pour concevoir votre file de commandes, vos identifiants, votre découpage en serveurs et le format de vos templates.

- Vous seront remis séparément : la référence technique de l'API (adresses, champs, exemples), une boutique de démonstration avec vos clés de test, et un fichier d'instructions pour votre Claude Code.
- Vous n'avez et n'aurez aucun accès aux bases, serveurs ou dépôts d'Aventy ni de Zimou Express. Tout passe par l'API.
- Un « client connecté », dans ce guide, c'est votre plateforme. Les mêmes règles serviront plus tard aux applis mobiles et aux caisses en magasin : concevez sans les exclure.

## 1. Règles non négociables

Chaque choix technique de votre plateforme doit respecter ces huit règles ; en cas de doute, elles l'emportent sur tout le reste.

1. **Aucune vente perdue.** Une commande valide est toujours enregistrée chez vous, puis transmise. Ni une panne d'Aventy, ni un stock incertain, ni un problème de livraison ne la font refuser.
2. **Le prix affiché est le prix facturé.** Vous affichez les prix et les frais reçus d'Aventy. Vous envoyez avec chaque commande ce que le client a vu.
3. **Aucun montant inventé.** Sans grille de livraison connue, vous prenez la commande avec la marque « frais à confirmer à l'appel », jamais avec 0 DA.
4. **Chaque site est un canal.** Il a sa propre clé, ses propres permissions, et chaque commande garde son site d'origine.
5. **Aucune porte ouverte obligatoire.** C'est vous qui allez chercher les changements chez Aventy ; Aventy n'a jamais besoin d'entrer chez vous pour que tout fonctionne.
6. **Aucun secret côté navigateur ou téléphone.** Les clés vivent sur vos serveurs, jamais dans une page, une appli ou un dépôt de code.
7. **Pensé contre l'attaque.** Des concurrents envoient des milliers de fausses commandes par script : votre formulaire doit l'arrêter (section 7).
8. **Plusieurs serveurs dès la conception.** Rien ne doit supposer une machine unique (section 8).

## 2. Qui fait foi sur quoi

Aventy est la référence pour tout ce qui se vend ; votre plateforme est la référence pour la commande tant qu'Aventy ne l'a pas acceptée.

| Donnée | Référence | Vous pouvez la modifier ? | Vous en gardez une copie ? |
|---|---|---|---|
| Produits, déclinaisons, images, catégories, prix | Aventy | non | oui, la dernière reçue, avec sa version |
| Produits publiés sur votre site | Aventy | non | oui |
| Livraison : types, frais, bureaux | Aventy | non | oui |
| Réglages et sections du site | Aventy, dans les limites de votre manifeste (section 4) | non | oui |
| Stock | Aventy | non | une réserve prêtée par Aventy |
| Commande avant acceptation | vous | création seulement | oui, dans votre file |
| Commande après acceptation, statuts | Aventy | non ; demande d'annulation seulement | oui, le statut reçu |
| Panier abandonné | vous | création seulement | oui, dans votre file |

En cas de conflit, il n'y a pas de fusion. Une donnée qui descend d'Aventy remplace votre copie si sa version est plus récente. Une donnée que vous envoyez n'est jamais modifiée après envoi : une correction est un nouvel envoi (par exemple une demande d'annulation).

Cette répartition vaut pour la phase actuelle. Plus tard, la plateforme pourra gérer certains produits ou prix elle-même : ne concevez rien qui l'interdise.

## 3. Identité, clés et secrets

Chaque site que vous hébergez se présente à Aventy avec sa propre clé, créée par le marchand dans Aventy et collée dans la console de votre site.

- **Une clé par site**, jamais une clé pour toute la plateforme. Le marchand peut la voir, la révoquer et la remplacer ; pendant un remplacement, l'ancienne et la nouvelle fonctionnent ensemble un moment.
- **Permissions accordées par le marchand**, site par site : commandes, livraison, configuration, catalogue, sections, statuts. Un appel hors permission est refusé : votre site doit le gérer proprement, sans planter.
- **Où vit la clé :** chiffrée en base sur vos serveurs, déchiffrée seulement au moment de l'appel. Jamais dans le code, jamais dans une variable visible du navigateur, jamais dans un journal.
- **La clé de chiffrement** doit vivre ailleurs que la base qu'elle protège (gestionnaire de secrets ou au minimum autre emplacement que la base).
- **Applis mobiles grand public (plus tard) :** elles ne contiennent aucune clé. Elles parlent à vos serveurs, qui parlent à Aventy.
- Une clé n'est liée à aucune adresse ou serveur : un site peut appeler Aventy depuis n'importe lequel de vos serveurs.

## 4. Ce que vous recevez d'Aventy

Vous allez chercher les données : une fois en entier au démarrage, puis seulement ce qui a changé.

### 4.1 Comment vous tirez les changements

- **Instantané :** lecture complète d'un domaine (catalogue, livraison, configuration, sections), qui vous donne aussi un curseur.
- **Changements :** à partir de votre curseur, Aventy vous donne la liste des éléments modifiés ou retirés, chacun avec sa version. Vous appliquez, puis vous gardez le nouveau curseur.
- **Battement :** chaque site appelle Aventy une fois par minute. La réponse indique quels domaines ont changé, pour ne tirer que quand c'est utile.
- **Signal optionnel :** si votre site expose une adresse, Aventy peut y envoyer un signal signé « il y a du nouveau ». Le signal ne contient aucune donnée : vous tirez ensuite. Un signal perdu ne casse rien, le battement rattrape.
- Un curseur trop ancien vous demande de repartir de l'instantané.

### 4.2 Catalogue

Vous ne recevez que les produits publiés sur votre site par le marchand, avec déclinaisons (référence complète couleur + taille), prix, images, catégories et numéro de version. Un produit retiré arrive comme « retiré ».

### 4.3 Livraison

Types permis, frais par wilaya et par bureau, livraison offerte réglée par site. Gardez toujours la dernière grille reçue.

### 4.4 Sections pilotées depuis Aventy : le manifeste

- Chaque template publie un manifeste : la liste des sections qu'il sait afficher, et pour chacune les réglages possibles (activée ou non, ordre, titre, texte FR et AR, image, produits ou catégorie liés), plus la marque et le thème.
- Aventy n'affiche au marchand que ce que votre manifeste déclare : le marchand ne voit jamais un réglage que votre template ne sait pas appliquer.
- Aventy vous envoie un état voulu complet et versionné (« ces sections, dans cet ordre, avec ces contenus »), pas une suite d'ordres. Vous l'appliquez et vous répondez la version appliquée.
- Publier ou dépublier le site entier fait partie de cet état voulu.
- **Conséquence pour vous dès maintenant :** vos pages doivent être construites à partir de données (une liste de sections et leurs réglages), jamais comme un enchaînement de composants écrit en dur.

## 5. Ce que vous envoyez à Aventy

Une commande est d'abord enregistrée chez vous, puis envoyée ; elle ne quitte votre file qu'après la réponse d'Aventy.

### 5.1 Identifiants

- **Identifiant d'envoi :** un ULID créé par votre plateforme au moment de la commande, unique au monde, jamais réutilisé, identique à chaque renvoi. C'est lui qui empêche les doublons.
- **Référence affichée au client :** un numéro lisible, préfixé par site. Aventy la conserve telle quelle.
- Aventy vous répond avec son propre identifiant de commande ; gardez la correspondance.
- Les paniers abandonnés suivent la même règle (ULID), jamais un compteur.

### 5.2 Contenu obligatoire d'une commande

| Bloc | Contenu |
|---|---|
| Lignes | référence complète de la déclinaison, quantité, prix unitaire affiché, version du catalogue utilisée |
| Livraison | type, bureau si retrait au bureau, frais affichés, version de la grille, ou marque « frais à confirmer » |
| Client final | nom, téléphone, wilaya et commune (identifiants), adresse complète |
| Parcours | achat direct ou panier récupéré, campagne si connue |
| Traces | heure d'envoi chez vous, navigateur, identifiant d'appareil |

L'adresse internet du client final n'est pas envoyée à Aventy : vous l'utilisez seulement pour votre protection (section 7).

### 5.3 Réponses d'Aventy

| Réponse | Ce que vous faites |
|---|---|
| Acceptée | marquer « envoyée », garder l'identifiant Aventy |
| Déjà reçue (même identifiant d'envoi) | même chose ; c'est bien votre commande, avec le même identifiant Aventy |
| Acceptée « À revoir », avec motifs | marquer « envoyée » ; rien à corriger chez vous, un agent rappellera |
| Refusée, contenu invalide (champs en cause) | ne pas réessayer ; alerte dans votre console, renvoi manuel après correction |
| Réessayer plus tard (indisponible ou limite) | réessayer avec attente croissante, sans fin, sans jamais perdre la commande |

Une réponse que vous ne reconnaissez pas n'est jamais un succès : la commande reste dans la file et une alerte part.

## 6. Hors ligne, reprise, statuts

Quand Aventy ne répond pas, votre site continue de vendre avec ses dernières copies et rejoue tout au retour, sans perte ni doublon.

| Situation | Vous faites | Vous ne faites jamais |
|---|---|---|
| Aventy injoignable | afficher le dernier catalogue, la dernière grille, les dernières sections ; prendre les commandes dans votre file | bloquer une vente, inventer un prix ou des frais |
| Aucune grille connue | prendre la commande, marque « frais à confirmer » | afficher 0 DA |
| Prix changé pendant la coupure | vendre au dernier prix connu, envoyer la version utilisée | rien de plus : Aventy signale l'écart |
| Retour de connexion | tirer les changements, puis vider la file dans l'ordre de création | supprimer un envoi sans réponse |
| Clé révoquée | arrêter d'envoyer, garder la file, alerter la console | effacer la file |

Votre file doit survivre à un redémarrage (stockage durable, pas en mémoire), être consultable et renvoyable depuis la console, et alerter quand une commande y attend depuis plus de 24 h.

**Stock :** Aventy prête à chaque site une réserve par déclinaison. Hors ligne, vous vendez dans la réserve. Au-delà, la commande est toujours prise ; le client voit avant de valider que le stock n'est pas garanti et qu'un agent confirmera la disponibilité à l'appel.

**Statuts :** après acceptation, Aventy est seul maître de la commande. Vous relisez le détail de vos propres commandes (contenu, famille de statut, suivi, frais facturés) pour informer le client final. Les familles sont : en attente, confirmée, expédiée, livrée, retournée, annulée. Vous pouvez envoyer une demande d'annulation quand le client se rétracte.

## 7. Sécurité et anti-inondation

Votre formulaire est la porte publique : c'est chez vous que les fausses commandes doivent être arrêtées.

- **Bouton bloqué dès le premier clic**, avec une garde qui refuse un second envoi tant que le premier est en cours.
- **Limite par téléphone ou par appareil :** une commande toutes les 10 minutes, réglable par le marchand, activée par défaut. Une tentative bloquée voit le même écran « commande reçue » (le script n'apprend rien), rien n'est créé, et la tentative est visible du marchand dans un journal.
- **Plafond large par adresse internet**, pour arrêter un script sans bloquer les abonnés mobiles qui partagent la même adresse.
- **Lecture de l'adresse du visiteur :** uniquement l'adresse de connexion vue par votre propre serveur frontal. Jamais un en-tête que le visiteur peut écrire lui-même : la première entrée de `X-Forwarded-For` est falsifiable.

**Webhooks reçus :** vérifiez toujours la signature et l'horodatage avant d'agir, et refusez un message trop ancien.

**Données personnelles :** ne gardez du client final que ce qui sert à sa commande, à votre file et au suivi affiché. Vos essais se font sur la boutique de démonstration avec des données fictives.

## 8. Architecture répartie sur plusieurs serveurs

La plateforme doit pouvoir tourner sur plusieurs serveurs dès le premier jour : quand le nombre de boutiques et de pages grandit, on ajoute des machines sans réécrire le code.

- **Aucun état propre à une machine :** pas de fichier local qui fait foi, pas de base locale par serveur, pas de cache en mémoire qui doit rester exact, pas de version lue dans un fichier local.
- **File d'envoi partagée avec réservation :** chaque commande en attente est réservée par un seul serveur à la fois (verrou en base), pour que deux serveurs ne l'envoient jamais en même temps et que l'envoi immédiat ne croise pas le rattrapage.
- **Tâches planifiées** (battement, rattrapage, rafraîchissement des copies) : protégées par un verrou, pour qu'une tâche ne tourne qu'une fois même si chaque serveur la lance.
- **Sessions :** portables d'un serveur à l'autre (cookie signé ou stockage partagé).
- **Tout se versionne dans le dépôt :** limites du serveur frontal, minuteries, configuration du proxy. Une machine doit pouvoir être réinstallée à l'identique sans rien saisir à la main.
- Un site peut être hébergé sur n'importe quel serveur : sa clé n'est liée à aucune adresse.
