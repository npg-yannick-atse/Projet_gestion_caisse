# Fond de Caisse — NPG Gandour · Documentation de l'application

> Application de gestion de caisse : bons de décaissement, portefeuilles, recharges, transferts et traçabilité comptable en partie double.
>
> **Stack** : Backend NestJS 10 + TypeORM 0.3 + SQL Server · Frontend React 19 + Vite · Mobile Expo.

## Sommaire

1. [Présentation & objectif](#1-présentation--objectif)
2. [Architecture & stack](#2-architecture--stack)
3. [Installation & configuration](#3-installation--configuration)
4. [Authentification & autorisation](#4-authentification--autorisation)
5. [Modèle de données](#5-modèle-de-données)
6. [Backend — modules & API](#6-backend--modules--api)
7. [Frontend — navigation & pages](#7-frontend--navigation--pages)
8. [Workflows métier](#8-workflows-métier)
9. [Traçabilité & audit](#9-traçabilité--audit)
10. [Annexes](#10-annexes)
11. [Points d'attention](#11-points-dattention)

---

## 1. Présentation & objectif

L'application « Fond de Caisse » (FDC) gère le circuit complet de décaissement d'espèces au sein de NPG Gandour : de la demande (bon) jusqu'au paiement effectif par un caissier, avec alimentation de la trésorerie (recharges, transferts, extensions de budget) et une traçabilité comptable complète.

**Chaîne de valeur globale :**

```
Demande (Bon) → Validation → (Impression/Signature) → Décaissement → Comptabilisation
```

**Alimentation de la trésorerie (en parallèle) :** Recharge caisse ↔ portefeuille · Transfert entre comptes · Extension de budget.

**Principes structurants :**

- **Bon / Sous-bon** — un *Bon* est une enveloppe légère ; le *Sous-bon* porte les données métier (montant, imputation, bénéficiaire). Un bon peut avoir plusieurs sous-bons, traités indépendamment.
- **Comptabilité** — chaque mouvement génère des écritures en **partie double** (débit = crédit) avec un **hash d'intégrité chaîné**.
- **Traçabilité** — **soft-delete** partout (rien n'est supprimé physiquement) ; toutes les actions sensibles sont journalisées.
- **Périmètres** — l'accès aux données est cloisonné par **direction, caisse, portefeuille et division**.

---

## 2. Architecture & stack

### Backend (`/backend`)

| Composant | Version / techno |
|---|---|
| Framework | NestJS 10.4 |
| ORM | TypeORM 0.3.20 |
| Base de données | SQL Server (driver `mssql` 11) |
| Auth | Passport + JWT (access + refresh) ; LDAP NPG optionnel |
| Chiffrement | bcrypt (12 rounds) |
| Doc API | Swagger / OpenAPI (`/api/v1/docs`) |
| Sécurité | Helmet (CSP désactivée) |
| Divers | ExcelJS (export), Winston (logs), UUID |

**Configuration globale** (`main.ts`) : préfixe API `api/v1`, `TrimPipe` (nettoyage des espaces) puis `ValidationPipe` strict (`whitelist` + `forbidNonWhitelisted` + `transform`), `ClassSerializerInterceptor`, filtre d'exceptions global, CORS configurable, Swagger activé.

### Frontend (`/frontend`)

| Composant | Version / techno |
|---|---|
| UI | React 19 + Vite 6 + TypeScript 5.7 |
| Data-fetching / cache | TanStack Query 5 |
| Routing | TanStack Router 1 |
| État global | Zustand 5 (auth, persona, notifications) |
| Formulaires | React Hook Form 7 + Zod 3 |
| Styling | Tailwind CSS 3 + composants custom |
| HTTP | Axios 1.7 (client centralisé + intercepteurs de tokens) |
| Icônes | Lucide React |

### Mobile

Application Expo (React Native) ; notifications push via Expo Push (jetons enregistrés côté backend).

---

## 3. Installation & configuration

### Base de données

Exécuter les scripts SQL (SQL Server 2019+) dans l'ordre :

| Script | Rôle |
|---|---|
| `db_init_gestion_caisse.sql` | Crée les **46 tables** + FK + index. Seed initial : 3 devises, 7 rôles, 4 profils, 4 types de bon, ~20 permissions. Idempotent. |
| `migration_bons_pays_division.sql` | Ajoute le support **restitution client** (colonnes `requiert_nom_client`, `nom_client`, `partenaire_id` nullable ; tables `ref_pays`, `ref_division`, `sec_user_division_access`) + permission `PORTEFEUILLE_VOIR_TOUS`. |
| `seed_utilisateurs.sql` | 4 utilisateurs NPG réels (matricules réels = clé LDAP). Idempotent. |
| `seed_comptes_test.sql` | 6 comptes de test (olivia.gbocho1-3, sara.goli1-3). Idempotent. |

> `DB_SYNCHRONIZE=false` : le schéma est géré par les scripts SQL, pas par TypeORM.

### Variables d'environnement (`backend/.env`)

| Clé | Rôle |
|---|---|
| `APP_PORT`, `API_PREFIX` | Port serveur (8080) et préfixe des routes (`api/v1`). |
| `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASS` / `DB_NAME` | Connexion SQL Server *(secrets — ne pas exposer)*. |
| `DB_ENCRYPT`, `DB_TRUST_SERVER_CERTIFICATE`, `DB_SYNCHRONIZE`, `DB_LOGGING` | Options de connexion / ORM. |
| `JWT_SECRET`, `JWT_EXPIRES_IN` (15m) | Access token. |
| `JWT_REFRESH_SECRET`, `JWT_REFRESH_EXPIRES_IN` (7d) | Refresh token. |
| `CORS_ORIGINS` | Origines front autorisées. |
| `LDAP_ENABLED` | `true` = auth LDAP ; `false` = **mode local de test** (voir §4). |
| `LDAP_AUTH_URL`, `LDAP_USERS_URL`, `LDAP_TIMEOUT_MS` | Service LDAP NPG. |

---

## 4. Authentification & autorisation

### 4.1 Authentification

**Mode LDAP (production, `LDAP_ENABLED=true`)**

1. L'utilisateur saisit son **username** + mot de passe.
2. Le backend appelle le service LDAP NPG (POST) qui valide le mot de passe.
3. Le **matricule** renvoyé par le LDAP est rapproché du compte local, qui doit **exister** et être **actif**.
4. Émission d'un couple **JWT** : access (~15 min) + refresh (~7 j). Payload : `{ sub, matricule, email }`.

**Mode LOCAL (test, `LDAP_ENABLED=false`)** — aucun contrôle de mot de passe. Un compte local actif se connecte avec **n'importe quel mot de passe**, en saisissant son **username, matricule ou email**.

**Contrôles complémentaires** : accès plateforme (`accesWeb` / `accesMobile`) ; rafraîchissement du token expiré via le refresh token.

### 4.2 Autorisation — rôles, profils, permissions

Les permissions effectives sont l'**union de 4 canaux** (`AuthorizationService.getEffectivePermissions`) :

```
Rôles (sec_user_role → sec_role_permission)
  + Profils (sec_user_profil → sec_profil_permission)
  + Permissions directes (sec_user_permission_extra, avec fenêtre date_debut/date_fin)
  + Intérims actifs (droits délégués)
```

Un droit obtenu par **au moins un canal** suffit. Les **administrateurs** (`SUPER_ADMIN`, `ADMINISTRATEUR`) contournent les contrôles. Le rôle **DAF** est un méta-rôle qui s'étend automatiquement en `ADMINISTRATEUR + CAISSIER`.

**Profils** : paquets de permissions réutilisables (catégories : VALIDATEUR, DEMANDEUR, CAISSIER, INTERIM), assignables par utilisateur — c'est le levier « fin ».

### 4.3 Périmètres (cloisonnement)

| Périmètre | Résolution | Effet |
|---|---|---|
| **Caisse** | `getCaissePerimeter` : caisses en accès ECRITURE/ADMIN | Un caissier n'agit que sur ses caisses. |
| **Portefeuille** | `getPortefeuillePerimeter` : possédés (USER) + direction + gérés (`gestionnaireId`) | Sauf permission `PORTEFEUILLE_VOIR_TOUS` → tous. |
| **Division** | `getDivisionPerimeter` : divisions explicitement autorisées | Restitutions client ; **vide = aucun accès** (pas de repli « tout voir »). |

Vérifications : `assertCaisseInPerimeter`, `assertPortefeuilleInPerimeter`, `assertDivisionInPerimeter` (lèvent `ForbiddenException`).

---

## 5. Modèle de données

**46 tables** réparties en 5 domaines. Colonnes transverses (via `AuditableEntity`) : `created_at/by`, `updated_at/by`, `deleted_at/by` (soft-delete), `version` (verrou optimiste). Montants en `DECIMAL(19,4)` (taux de change en `DECIMAL(19,8)`), sérialisés en `string`. UUID publics sur les entités exposées (bon, sous-bon, portefeuille, partenaire, bon-caisse).

### 5.1 Sécurité (`sec_`, 13 tables)

| Table | Rôle |
|---|---|
| `sec_user` | Utilisateurs (matricule, email, direction, cost center, accès web/mobile). |
| `sec_direction` | Directions (entités organisationnelles). |
| `sec_role` | Rôles (7 codes). |
| `sec_profil` | Profils (paquets de permissions). |
| `sec_permission` | Permissions granulaires (~20). |
| `sec_user_role`, `sec_user_profil` | Liaisons utilisateur ↔ rôle / profil. |
| `sec_role_permission`, `sec_profil_permission` | Liaisons rôle / profil ↔ permission. |
| `sec_user_caisse_access` | Accès caisse (LECTURE / ECRITURE / ADMIN). |
| `sec_user_cost_center` | Rattachement centres de coût (principal / secondaires). |
| `sec_user_permission_extra` | Permissions directes (scope + fenêtre de validité). |
| `sec_user_division_access` | Accès divisions (restitutions). |
| `sec_interim` | Délégations de droits (permission / rôle / profil). |

### 5.2 Référentiel (`ref_`, ~10 tables)

`ref_type_bon` (types de bon + flags de champs requis), `ref_partenaire` (clients/fournisseurs), `ref_plan_comptable` (hiérarchie de comptes), `ref_cost_center` (centres de coût, budget annuel), `ref_nature_operation`, `ref_nature_comptable` (cache SAP), `ref_partenaire_nature_comptable`, `ref_site`, `ref_pays`, `ref_division` (par pays).

### 5.3 Financier (`fin_`, 7 tables)

`fin_devise`, `fin_taux_echange` (taux temporels), `fin_caisse` (statut OUVERTE/FERMEE), `fin_session_caisse` (ouverture/clôture, soldes), `fin_portefeuille` (propriétaire USER/DIRECTION, caisse source, gestionnaire, budget mensuel), `fin_compte_gain_change`, `fin_compte_perte_change`.

### 5.4 Transactionnel (`trx_`, 9 tables)

| Table | Rôle |
|---|---|
| `trx_bon` | Enveloppe de bon (statut, récurrence, extension, `montant_total` snapshot). |
| `trx_sous_bon` | Cœur métier (montant, partenaire, imputation, caisse/portefeuille, pays/division, statut). |
| `trx_validation_bon` | Historique des validations (bon **ou** sous-bon). |
| `trx_impression_bon` | Impressions + signature numérique (image). |
| `trx_bon_caisse` | Copie de travail caissier au décaissement (montant/libellé ajustables). |
| `trx_decaissement` | Exécution effective (bénéficiaire, montant, portefeuille). |
| `trx_operation` | Journal générique (RECHARGE / DECAISSEMENT / TRANSFERT / AJUSTEMENT). |
| `trx_transfert` | Transfert multi-devise (gain/perte de change, machine à états). |
| `trx_ecriture_comptable` | Écritures immuables (partie double, hash chaîné). |

### 5.5 Audit & intégration (`aud_`, 9 tables)

`aud_journal` (audit append-only), `aud_evenement_bon` (event sourcing bons), `aud_outbox` + `aud_log_sap` (intégration SAP asynchrone), `aud_idempotency_key`, `aud_snapshot_journalier` (réconciliation caisse), `aud_planification_recurrence` (bons récurrents), `aud_changement_permission` (gains/pertes de droits), `aud_notification`.

### 5.6 Relations clés

```
trx_bon ─1:N─ trx_sous_bon ──> fin_caisse / fin_portefeuille / fin_devise
                            ──> ref_partenaire / ref_cost_center / ref_nature_comptable
                            ──> ref_pays / ref_division      (restitution)
fin_portefeuille ──> fin_caisse (caisse_source)
fin_session_caisse ──> fin_caisse   (1 seule session OUVERTE / caisse)
trx_bon_caisse ──> trx_sous_bon ; trx_decaissement ──> trx_bon_caisse
trx_ecriture_comptable ──> ref_plan_comptable / fin_devise / trx_bon / trx_sous_bon
```

---

## 6. Backend — modules & API

Toutes les routes sont préfixées par `/api/v1`. Sauf mention `@Public`, elles requièrent un JWT (`@JwtAuthGuard`).

### `auth`
`POST /auth/login` (public), `POST /auth/refresh` (public), `GET /auth/me`.

### `security`
- **users** : CRUD utilisateurs (create/update/delete réservés `ADMINISTRATEUR`) ; `GET /users/:id/roles|effective-roles|permissions|profils|divisions` ; assignation/retrait de **rôles**, **profils** et **accès division** (`POST`/`DELETE`).
- **roles** : CRUD rôles + CRUD **permissions** (`/roles/permissions...`) + assignation permission↔rôle.
- **profils** : CRUD profils + assignation permission↔profil.
- **directions** : CRUD directions.
- **interims** : gestion des délégations. **ldap-directory** : recherche annuaire LDAP.

### `financier`
- **caisses** : CRUD (permissions `CAISSE_MODIFIER/SUPPRIMER`) ; `GET /:id/solde|sessions|session-courante` ; `POST /:id/ouvrir|cloturer` (`CAISSIER`).
- **portefeuilles** : CRUD (permissions `PORTEFEUILLE_MODIFIER/SUPPRIMER`) ; `GET` avec **restriction de visibilité** ; `GET /:id/solde`.
- **devises** : lecture.
- **demandes-recharge** : `POST` (créer), `GET`, `GET /mes-portefeuilles`, `POST /:id/traiter|rejeter` (`CAISSIER`), `POST /:id/annuler` (demandeur).
- **demandes-transfert** / **recharge** : création, décision, exécution des transferts et recharge directe caisse↔portefeuille.

### `transactionnel`
- **bons** : `POST` (créer), `GET` (filtres + tri), `GET /stats/*` (dashboards), `GET /perimetre/mine`, `GET /:id`, `GET /:id/soubons|impression`, `PATCH /:id` et `/:bonId/soubons/:sousBonId` (statut CREE), `POST /:id/validate` (`VALIDATEUR`), `POST /:id/extension/approuver|refuser` (permission `EXTENSION_APPROUVER`), `POST /:id/print|sign|cancel`, `POST /:id/decaisser` (legacy).
- **bons-caisse** (workflow décaissement) : `POST /prepare`, `PATCH /:id`, `POST /:id/finalize`, `POST /:id/cancel`, `GET` divers (`CAISSIER`).
- **bons-manuels** : `carnets` (CRUD + clôture) et `bons-manuels` (décaissement direct).
- **ledger** : `operations` (liste, export Excel, par caisse/portefeuille), `ecritures` (+ paired), `balance/:compteId`, vérification d'équilibre des transactions.

### `referentiel`
CRUD sur `partenaires`, `cost-centers`, `natures-operation`, `plan-comptable`, `pays`, `divisions` (création/modification/suppression réservées `ADMINISTRATEUR`) ; lecture sur `type-bons`, `natures-comptable`, `sites`.

### `audit`
`GET /audit` — journal filtrable, réservé `SUPER_ADMIN`.

### `notifications`
`POST /push-tokens`, `DELETE /push-tokens/:token` — jetons Expo ; notification best-effort des validateurs à la création d'un bon.

---

## 7. Frontend — navigation & pages

### 7.1 Menu (par section)

- **Principal** : Tableau de bord · Caisses & Portefeuilles · Recharge · Demandes de recharge · Transferts · Opérations.
- **Opération** : Bons · Bons manuels · Demandes d'extension · Intérims · Log.
- **Administration** : Utilisateurs · Rôles · Profils.
- **Master Data** : Directions · Partenaires · Centres de coût · Natures d'opération · Plan comptable · Pays & Divisions.

Chaque entrée est filtrée par rôle. La sidebar (desktop) est repliable ; les sections sont des accordéons.

### 7.2 Pages principales

| Page | Rôle |
|---|---|
| `DashboardPage` | Aiguille vers le dashboard du persona. |
| `LoginPage` | Authentification. |
| `BonsPage` / `BonDetailPage` / `BonCreatePage` | Liste / détail / création de bons. |
| `BonsManuelsPage` | Bons manuels (carnets + décaissement direct). |
| `DemandesRechargePage` | Demandes de recharge (créer via modal + confirmation, traiter, rejeter). |
| `DemandesTransfertPage` | Demandes de transfert (créer via modal + confirmation, approuver, exécuter). |
| `DemandesExtensionPage` | Extensions de budget (par portefeuille, historique, anticipation). |
| `RechargePage` | Recharge directe caisse ↔ portefeuille. |
| `OperationsPage` | Journal des opérations (filtres, tri, export Excel). |
| `CaissesPage` / `PortefeuillesPage` | Gestion caisses / portefeuilles + soldes + sessions. |
| `UsersPage` / `RolesPage` / `ProfilsPage` | Administration des accès. |
| `DirectionsPage`, `PartenairesPage`, `CostCentersPage`, `NaturesOperationPage`, `PlanComptablePage`, `PaysDivisionsPage` | Référentiels (CRUD). |
| `InterimsPage` | Délégations. |
| `AuditPage` | Journal d'audit (Log). |

### 7.3 Dashboards par rôle

`SuperAdminDashboard` (santé système), `AdminDashboard` (KPIs globaux + bons par direction), `DAFDashboard` (pilotage + caisse fusionnés), `CaissierDashboard` (caisses, décaissements, demandes), `ValidateurDashboard` (bons à valider, budgets), `GestionnaireDashboard` (portefeuilles, burn rate), `DemandeurDashboard` (cycle de vie des bons).

### 7.4 État & API

- **Stores Zustand** : `auth.store` (session), `persona.store` (persona actif + priorité), `notifications.store` (notifications lues).
- **Couche API** (`src/api/*`) : un fichier par domaine (bons, demandesRecharge, demandesTransfert, caisses, financierRef, users, ledger, recharge, audit, roles, profils, referentiel, bonsManuels, bonsCaisse, ldap, interims). Requêtes via TanStack Query, invalidation de cache sur mutation.
- **Notifications** : polling ~30 s + popover (bons à valider, recharges/transferts à traiter) ; notifications bureau opt-in.
- **Protection** : composant `RoleGuard` (défense côté client, la vérification faisant autorité restant côté backend).

---

## 8. Workflows métier

### 8.1 Cycle de vie d'un bon

```
CREE → VALIDE → DECAISSE → COMPTABILISE     (ou ANNULE / REFUSE)
```

1. **Création** (Demandeur) — bon + sous-bons (imputation, montant, caisse source, portefeuille cible). Champs requis selon le type de bon ; restitution client ⇒ pays + division obligatoires (accès division requis). **Auto-validation** si le créateur est VALIDATEUR/admin.
2. **Validation** (Validateur) — bon en CREE ; même direction que le demandeur ; interdit de valider son propre bon (admins exemptés). → VALIDE ou REFUSE.
3. **Impression / signature** — optionnelle.
4. **Décaissement** — voir §8.2 ; quand tous les sous-bons sont décaissés, le bon passe DECAISSE.

### 8.2 Décaissement (workflow caissier)

```
PREPARE → (ajustements) → FINALISE     (ou ANNULE)
```

- **prepare** : copie de travail (Bon de caisse) créée à partir d'un sous-bon VALIDE ; snapshot d'origine conservé.
- **update** : ajuste bénéficiaire, pièce, libellé, **montant** (tant que PREPARE).
- **finalize** : **garde de solde** (refus si le portefeuille passerait en négatif, sauf extension « découvert » approuvée) ; **montant effectif = montant ajusté ?? montant d'origine** ; écritures partie double (DÉBIT portefeuille / CRÉDIT charge) + décaissement + opération ; sous-bon → DECAISSE. **Audit dédié** (`DECAISSEMENT` ou `DECAISSEMENT_MONTANT_AJUSTE`).
- **cancel** : abandonne la préparation (le sous-bon reste VALIDE).

### 8.3 Demande de recharge de portefeuille

```
EN_ATTENTE → TRAITEE     (ou REJETEE / ANNULEE)
```

Demandeur : VALIDATEUR / GESTIONNAIRE_PORTEFEUILLE (ou admin) ; portefeuille cible = les siens/direction, **ou tous** si `PORTEFEUILLE_VOIR_TOUS`. Le **caissier** traite (montant ajustable → recharge caisse→portefeuille) ou rejette ; le demandeur peut annuler tant que la demande est EN_ATTENTE.

### 8.4 Demande de transfert

```
CREE → APPROUVEE → EXECUTEE     (ou REJETEE / ANNULEE)
```

Création : CAISSIER / GESTIONNAIRE_PORTEFEUILLE (source ≠ destination, source dans le périmètre). Décision : GESTIONNAIRE_PORTEFEUILLE (≠ demandeur). Exécution : génère l'opération de transfert + écritures (gain/perte de change si multi-devise).

### 8.5 Extension de budget

Le créateur coche « demande d'extension » (→ EN_ATTENTE). Décision (permission `EXTENSION_APPROUVER`) en deux modes : **DÉCOUVERT** (autorise le solde négatif au décaissement) ou **RECHARGE** (recharge le portefeuille depuis la caisse source). La garde de solde du décaissement applique la décision.

### 8.6 Intérim (délégation)

```
ACTIF → EXPIRE     (ou REVOQUE)
```

Un initiateur délègue à un remplaçant **une permission**, **un rôle** ou **un profil** (un seul à la fois), sur une période. Les droits délégués actifs s'ajoutent aux droits propres du remplaçant.

### 8.7 Ouverture / clôture de caisse

```
Caisse FERMEE → Ouvrir (session OUVERTE) → Clôturer (session FERMEE)
```

Acteur : CAISSIER. Une seule session ouverte par caisse. Une caisse ouverte ne peut être désactivée ni supprimée.

### 8.8 Bons manuels

Circuit court : un administrateur crée un **carnet** (plage de numéros, rattaché à une caisse et un caissier) ; le caissier saisit un bon manuel qui **décaisse directement** (hors circuit de validation).

---

## 9. Traçabilité & audit

- **Interception globale** : toute requête modifiante (POST/PATCH/PUT/DELETE) d'un utilisateur authentifié est journalisée (`aud_journal`) : acteur, action, entité, avant/après, IP, user-agent. Les mots de passe et images de signature sont masqués.
- **Entrées dédiées** : certaines actions métier écrivent une trace enrichie (ex. décaissement avec montant d'origine → montant effectif).
- **Changements de droits** : gains/pertes de permission (via rôle, profil, extra, intérim) tracés dans `aud_changement_permission`.
- **Comptabilité** : écritures immuables à **hash chaîné** ; réconciliation quotidienne (`aud_snapshot_journalier`).
- **Consultation** : page **Log** réservée au `SUPER_ADMIN` (filtres date / action / entité).

---

## 10. Annexes

### 10.1 Rôles

| Code | Vocation |
|---|---|
| `DEMANDEUR` | Crée les bons. |
| `VALIDATEUR` | Valide les bons de sa direction ; arbitre les extensions. |
| `CAISSIER` | Décaisse ; traite recharges ; exécute transferts ; ouvre/clôture caisses. |
| `GESTIONNAIRE_PORTEFEUILLE` | Pilote les portefeuilles ; approuve transferts ; initie recharges. |
| `ADMINISTRATEUR` | Administration transverse. |
| `SUPER_ADMIN` | Accès total + audit. |
| `DAF` | Méta-rôle = ADMINISTRATEUR + CAISSIER. |

### 10.2 Permissions (extrait)

`BON_CREER`, `BON_VALIDER`, `BON_SIGNER`, `BON_DECAISSER`, `BON_MULTI_CC`, `BON_MODIFIER_SPEC`, `EXTENSION_APPROUVER`, `CAISSE_OUVRIR`, `CAISSE_CLOTURER`, `CAISSE_MODIFIER`, `CAISSE_SUPPRIMER`, `CAISSE_PRINCIPAL_CHOISIR`, `PORTEFEUILLE_MODIFIER`, `PORTEFEUILLE_SUPPRIMER`, `PORTEFEUILLE_VOIR_TOUS`, `TRANSFERT_INITIER`, `INTERIM_DECLARER`, `ADMIN_USER`, `ADMIN_ROLE`.

### 10.3 Récapitulatif des statuts

| Entité | Statuts |
|---|---|
| Bon / Sous-bon | `CREE → VALIDE → DECAISSE → COMPTABILISE` \| `ANNULE` \| `REFUSE` |
| Bon de caisse | `PREPARE → FINALISE` \| `ANNULE` |
| Demande de recharge | `EN_ATTENTE → TRAITEE` \| `REJETEE` \| `ANNULEE` |
| Demande de transfert | `CREE → APPROUVEE → EXECUTEE` \| `REJETEE` \| `ANNULEE` |
| Extension de budget | `NON` \| `EN_ATTENTE → APPROUVEE / REFUSEE` |
| Intérim | `ACTIF → EXPIRE` \| `REVOQUE` |
| Session de caisse | `OUVERTE → FERMEE` |
| Transfert (machine à états) | `INITIE → DEBIT_SOURCE_OK → CREDIT_CIBLE_OK → ECRITURE_CHANGE_OK → TERMINE` \| `COMPENSATION` \| `ANNULE` |

---

## 11. Points d'attention

- **`LDAP_ENABLED=false` est un réglage de TEST** (n'importe quel mot de passe est accepté). À repasser à `true` en production.
- **Secrets** : `backend/.env` contient les identifiants BD et les secrets JWT — ne pas versionner ni exposer.
- **Rôle par défaut UI** : un compte **sans aucun rôle** est affiché par défaut comme `DEMANDEUR` côté frontend (`persona.store`), et l'endpoint de création de bon n'impose pas explicitement `BON_CREER`. Durcissement recommandé (écran « aucun rôle » + garde `BON_CREER`).
- **Impression/signature** non exigées avant décaissement (assouplissement métier).

---

*Documentation générée à partir de la cartographie du code (backend, modèle de données, frontend, rôles & workflows). Voir aussi `Documentation_Flux_Application.docx` pour la vue « flux » au format Word.*
