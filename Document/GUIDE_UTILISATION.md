# Fond de Caisse — Guide d'utilisation & de test

Application de **gestion de caisse, bons et portefeuilles** (NPG Gandour).
Ce document explique comment utiliser l'application pour la **phase de test**.

---

## 1. Accès & connexion

- **URL (web)** : `http://10.10.32.2:8078`
- **Identifiant** : ton **identifiant LDAP** (type `prenom.nom`) + mot de passe habituel.
- Après connexion, tu arrives sur le **Tableau de bord** correspondant à ton rôle.

> Si « Identifiants invalides » : vérifie l'identifiant LDAP, et que ton compte **existe** dans l'application (un admin doit l'avoir créé et lui avoir attribué un rôle).

---

## 2. Les rôles (qui peut faire quoi)

| Rôle | Peut principalement… |
|---|---|
| **Demandeur** | Créer des demandes de bons, suivre ses bons, demander une recharge |
| **Validateur** | Valider / refuser les bons **de sa direction** |
| **Caissier** | Décaisser les bons, recharger les portefeuilles, **bons manuels**, ouvrir/clôturer une caisse |
| **Gestionnaire de portefeuille** | Piloter ses portefeuilles, arbitrer les transferts |
| **Administrateur** | Tout le paramétrage (utilisateurs, rôles, caisses, carnets…) |
| **DAF** | Combo **Administrateur + Caissier** (un seul tableau de bord) |
| **Super Admin** | Tout + page **Audit** + santé système |

> Un même utilisateur peut avoir **plusieurs rôles** : un sélecteur en haut permet de **basculer** entre les tableaux de bord.

---

## 3. Pré-requis avant de tester (à faire par un Admin)

Pour tester de bout en bout, il faut un minimum de données :
1. **Devise(s)** (ex. XOF) et **Caisse(s)** ouvertes.
2. **Portefeuilles** rattachés à une caisse (avec un **solde initial**).
3. **Utilisateurs** avec leurs **rôles** (au moins : 1 Demandeur, 1 Validateur, 1 Caissier, 1 Admin) et leur **direction**.
4. **Référentiel** : au moins un **Type de bon**, un **Centre de coût**, un **Partenaire**.
5. Pour les **bons manuels** : un **Carnet** (créé par un admin, assigné à un caissier).

---

## 4. Parcours de test recommandé (de bout en bout)

### Parcours A — Cycle d'un bon normal
1. **Demandeur** → menu **Bons** → **Nouveau bon** :
   - Choisir le **Type de bon**, ajouter au moins un **sous-bon** (libellé, montant, **centre de coût**, **portefeuille** → la caisse et la devise se déduisent, N° BL, code manutention ; partenaire optionnel).
   - (Optionnel) **Porteur** : la personne qui ira retirer à la caisse ; **Récurrent** si renouvellement mensuel.
   - **Créer** → le bon passe en statut **En attente** (`CRÉÉ`).
2. **Validateur** (même direction) → menu **Bons** → ouvrir le bon → **Valider** (ou **Refuser** avec commentaire).
   - 👉 Si c'est un **signataire** qui crée le bon lui-même, il est **validé automatiquement**.
3. **Caissier** → ouvrir le bon **Validé** → **Décaisser** un sous-bon (ou **Décaisser tout**) → saisir le **bénéficiaire** → le bon passe **Décaissé**.
4. Vérifier dans **Opérations** que le décaissement apparaît.

> **Imprimer / Signer** restent disponibles sur le bon mais **ne sont plus obligatoires** avant de décaisser.

### Parcours B — Recharge d'un portefeuille
1. **Demandeur** → **Demandes de recharge** → demander une recharge (montant + motif).
2. **Caissier** → **Demandes de recharge** → traiter la demande (approuver = exécuter la recharge).
   - Ou directement **Caissier** → **Recharge** → recharger un portefeuille depuis sa caisse.
3. Vérifier que le **solde du portefeuille** augmente.

### Parcours C — Bon manuel (voir §6).

---

## 5. Détail par module

### 5.1 Tableau de bord
KPIs et raccourcis adaptés à ton rôle (bons en attente, à décaisser, demandes à traiter, utilisation du budget…).

### 5.2 Caisses & Portefeuilles
- Chaque **caisse** (carte **verte**) est affichée avec **ses portefeuilles** (cartes **bleues**) **dans le même bloc**.
- **Caissier** : boutons **Ouvrir / Clôturer** la caisse.
- **Créer une caisse** / **un portefeuille** : visible si tu as la **permission** (ou admin/DAF).
- Le **solde initial** d'un portefeuille est modifiable (bouton ✏️).
- ⚠️ Une **caisse fermée** bloque les opérations sur ses portefeuilles.

### 5.3 Bons
- **Liste** : par défaut **les bons du jour** ; filtre **par dates** (Du / Au), recherche, bouton **Réinitialiser** pour tout afficher.
- **Détail d'un bon** : informations, **sous-bons** (avec **centre de coût**), actions selon le statut et ton rôle.
- **Valider** : réservé aux **Validateurs** (de la même direction, pas son propre bon) → sinon refusé.
- **Décaisser** : réservé au **Caissier**.

### 5.4 Recharge / Demandes de recharge / Transferts
- **Recharge** (Caissier) : alimenter un portefeuille depuis sa caisse.
- **Demandes de recharge** : le demandeur demande, le caissier traite.
- **Transferts** : demande de transfert entre caisses/portefeuilles (Caissier / Gestionnaire).

### 5.5 Opérations
- Tous les **mouvements** (Recharge, Décaissement, Transfert).
- Par défaut **les opérations du jour** ; filtre par dates + recherche ; **export Excel (.xlsx)**.

### 5.6 Administration (Admin / Super Admin)
- **Utilisateurs** : créer, attribuer la **direction** et les **rôles**.
- **Rôles / Profils** : attribuer les **permissions** (ex. autoriser un rôle à modifier les caisses).
- **Intérims** : déléguer temporairement ses droits à un collègue (dates de début/fin) ; les bons créés par le remplaçant restent visibles par l'initiateur.
- **Directions / Partenaires / Centres de coût / Plan comptable** : référentiels.
- **Audit** (Super Admin) : journal de toutes les modifications/suppressions.

---

## 6. Bons manuels (carnets)

Un **bon manuel** = un décaissement issu d'un **carnet papier**, **hors circuit** (pas de demande → validation → impression). Le caissier décaisse directement, en gardant la traçabilité.

### Étape 1 — Créer un carnet (Admin)
- Menu **Bons manuels** → **Nouveau carnet (admin)** : **Caisse**, **Caissier détenteur**, **N° début** (ex. 1000) et **N° fin** (ex. 1050).

### Étape 2 — Saisir un bon manuel (Caissier)
- Menu **Bons manuels** → **Nouveau bon manuel** :
  - **Carnet** (le sien) → le **prochain n°** se pré-remplit,
  - **N° du bon**, **Montant**, **Portefeuille** (caisse & devise déduites),
  - **Les mêmes informations qu'un bon normal** : Type de bon, Libellé, Centre de coût, Partenaire (opt.), N° BL, Code manutention, N° client (opt.), Description (opt.),
  - **Donneur d'ordre** : un **utilisateur** du système **ou** un **nom libre**,
  - **Bénéficiaire** (qui a retiré),
  - **Décaisser le bon manuel**.
- Résultat : le bon est créé **directement décaissé**, le **solde du portefeuille baisse**, le carnet **avance** (épuisé au dernier n°), et l'opération apparaît dans **Opérations**.

> Contrôles : numéro **dans la plage** du carnet et **non réutilisé**, portefeuille **de la caisse du carnet**, **donneur d'ordre** obligatoire.

---

## 7. Application mobile (Expo)

L'app mobile permet : **se connecter** (LDAP), voir **Mes bons** (filtre par dates + total décaissé), **créer une demande**, **valider** (pour les validateurs).
Navigation par **onglets** en bas : **Mes bons · À valider · Nouveau · Compte**.

---

## 8. Quoi remonter en cas de problème

Pour chaque anomalie, note si possible :
- **Qui** (rôle/identifiant), **où** (page/écran), **quoi** (action faite),
- le **message d'erreur** exact (capture d'écran),
- ce qui était **attendu** vs ce qui s'est **passé**.

Merci, et bon test ! 🙌
