# Documentation de la base de données — `npg_gestion_caisse`

> Application **Fond de Caisse** (NPG Gandour) — gestion des caisses, bons, portefeuilles
> et écritures comptables en partie double.
>
> **Sources de référence** : [db_init_gestion_caisse.sql](db_init_gestion_caisse.sql) (DDL faisant foi),
> `MCD_Fond_de_Caisse_v2.svg`, `Dossier_Conception_Fond_de_Caisse.docx`,
> `MODEL_FORMEL_PROJET_CAISSE_WALLET.docx`.

---

## 1. Vue d'ensemble

| Élément | Valeur |
|---|---|
| SGBD | Microsoft SQL Server 2019+ (cible 2022) |
| Base | `npg_gestion_caisse` |
| Collation | `French_CI_AS` |
| Isolation | `READ_COMMITTED_SNAPSHOT ON` (lecture non bloquante) |
| Nombre de tables | **46** |
| Domaines | `sec_` (13) · `ref_` (8) · `fin_` (7) · `trx_` (9) · `aud_` (9) |
| Accès applicatif | Backend NestJS 10 + TypeORM 0.3 (driver `mssql`) |

Le modèle repose sur le principe **MCD v2** : le **Bon** (`trx_bon`) est une *enveloppe légère*
tandis que le **Sous-bon** (`trx_sous_bon`) porte le **cœur métier** (montant, partenaire, caisse,
portefeuille, imputation comptable). Un bon contient un ou plusieurs sous-bons.

---

## 2. Conventions de modélisation

Ces conventions sont appliquées **uniformément** sur toutes les tables métier :

| Convention | Implémentation |
|---|---|
| Clé primaire | `id BIGINT IDENTITY(1,1)` |
| Identifiant public | `uuid UNIQUEIDENTIFIER DEFAULT NEWSEQUENTIALID()` (tables exposées) |
| Montants | `DECIMAL(19,4)` |
| Taux de change | `DECIMAL(19,8)` |
| Dates / horodatage | `DATETIME2(3)`, valeur `SYSUTCDATETIME()` (UTC) |
| Booléens | `BIT` |
| Texte | `NVARCHAR` (Unicode partout) |
| JSON | `NVARCHAR(MAX)` + contrainte `CHECK (ISJSON(...) = 1)` |
| Énumérations | contrainte `CHECK (colonne IN (...))` |
| Traçabilité | `created_at`, `created_by_id`, `updated_at`, `updated_by_id` |
| Suppression logique | `deleted_at`, `deleted_by_id` (*soft delete*) |
| Verrou optimiste | colonne `version INT` (défaut 1) |
| Idempotence DDL | `IF NOT EXISTS` / `IF OBJECT_ID(...) IS NULL` sur chaque objet |

> **Remarque** : les tables purement événementielles ou *append-only*
> (`aud_journal`, `aud_evenement_bon`, `trx_ecriture_comptable`, tables de liaison…)
> n'ont pas toutes les colonnes d'audit/soft-delete ni la colonne `version`.

---

## 3. Domaine `sec_` — Sécurité (13 tables)

Gestion des utilisateurs, de l'autorisation (rôles, profils, permissions), des accès aux
caisses, des centres de coût et de l'intérim.

| Table | Rôle |
|---|---|
| `sec_direction` | Directions de l'entreprise |
| `sec_role` | Rôles **système** (liste fermée, voir ci-dessous) |
| `sec_permission` | Permissions atomiques (rattachées à un `module`) |
| `sec_profil` | Profils par catégorie métier (`VALIDATEUR`, `DEMANDEUR`, `CAISSIER`, `INTERIM`) |
| `sec_user` | Utilisateurs (matricule, email, hash mdp, direction, CC principal) |
| `sec_user_role` | Liaison **user ↔ rôle** (PK composite) |
| `sec_role_permission` | Liaison **rôle ↔ permission** |
| `sec_user_profil` | Liaison **user ↔ profil** |
| `sec_profil_permission` | Liaison **profil ↔ permission** |
| `sec_user_caisse_access` | Accès d'un user à une caisse (`LECTURE` / `ECRITURE` / `ADMIN`) |
| `sec_user_cost_center` | Centres de coût d'un user (dont un `est_principal`) |
| `sec_user_permission_extra` | Permissions **additionnelles** ponctuelles, avec *scope* et fenêtre de validité |
| `sec_interim` | Délégation temporaire (rôle/profil/permission) d'un initiateur vers un remplaçant |

**Rôles autorisés** (`CK_sec_role_code`) : `SUPER_ADMIN`, `ADMINISTRATEUR`, `VALIDATEUR`,
`DEMANDEUR`, `CAISSIER`.

**Modèle d'autorisation** : un utilisateur cumule des permissions via **3 canaux** — ses rôles
(`role → permission`), ses profils (`profil → permission`) et ses permissions extra
(`sec_user_permission_extra`, éventuellement bornées dans le temps et limitées à un `scope_type` :
`CAISSE`, `BON`, `PORTEFEUILLE`, `SOUS_BON`, `PARTENAIRE`). L'intérim (`sec_interim`) permet de
transférer temporairement des droits ; il est contraint (`date_fin > date_debut`,
`initiateur_id <> remplacant_id`, statut `ACTIF`/`EXPIRE`/`REVOQUE`).

---

## 4. Domaine `ref_` — Référentiel (8 tables)

Données de référence relativement stables, partiellement synchronisées avec SAP.

| Table | Rôle |
|---|---|
| `ref_plan_comptable` | Plan comptable **hiérarchique** (`parent_id` auto-référencé) |
| `ref_cost_center` | Centres de coût (budget annuel, rattachés à une direction) |
| `ref_nature_operation` | Natures d'opération (→ cost center + plan comptable) |
| `ref_nature_comptable` | Natures comptables (**cache local SAP**, `code_comptable_sap`) |
| `ref_partenaire` | Tiers **unifié** client + fournisseur (`type_partenaire` : `CLIENT`/`FOURNISSEUR`/`MIXTE`) |
| `ref_partenaire_nature_comptable` | Liaison partenaire ↔ nature comptable (avec `est_par_defaut`) |
| `ref_site` | Sites / implantations |
| `ref_type_bon` | Types de bon et leurs exigences (`requiert_numero_client`, `requiert_partenaire`, `requiert_bl`) |

> `ref_partenaire` possède un **index unique filtré** `UX_ref_partenaire_numero_client`
> (unicité du numéro client **uniquement quand renseigné**).

---

## 5. Domaine `fin_` — Financier (7 tables)

Caisses, sessions, portefeuilles (wallets), devises, taux de change et comptes techniques de
gain/perte de change.

| Table | Rôle |
|---|---|
| `fin_devise` | Devises (`XOF`, `EUR`, `USD`…), nb de décimales 0–8 |
| `fin_taux_echange` | Taux entre deux devises, avec fenêtre de validité et `source` (`FIXE_DB`/`API`) |
| `fin_caisse` | Caisses physiques (devise, caissier, site, `statut` `OUVERTE`/`FERMEE`) |
| `fin_session_caisse` | Sessions d'ouverture/clôture d'une caisse (soldes, `type_cloture` `AUTO_20H`/`MANUEL`) |
| `fin_portefeuille` | **Wallets** (propriétaire `USER` ou `DIRECTION`, alimentés depuis une caisse source) |
| `fin_compte_gain_change` | Compte technique de **gain** de change (1 par devise) |
| `fin_compte_perte_change` | Compte technique de **perte** de change (1 par devise) |

**Règles fortes** :
- **Une seule session OUVERTE par caisse** : index unique filtré `UX_fin_session_caisse_ouverte`
  (`WHERE statut = N'OUVERTE'`).
- Un taux exige `taux > 0`, `devise_source <> devise_cible` et une période cohérente.
- Un portefeuille est polymorphe via `(proprietaire_type, proprietaire_id)`.

---

## 6. Domaine `trx_` — Transactionnel (9 tables)

Cœur métier : cycle de vie des bons, décaissements, opérations, transferts inter-caisses et
écritures comptables.

| Table | Rôle |
|---|---|
| `trx_bon` | **Enveloppe** du bon (numéro, demandeur, type, statut, récurrence, montant total) |
| `trx_sous_bon` | **Cœur métier** : montant, partenaire, BL, imputation (CC, nature), caisse, portefeuille, devise |
| `trx_validation_bon` | Validations/signatures (cible bon **ou** sous-bon, multi-niveaux, action `VALIDE`/`REFUSE`/`SIGNE`) |
| `trx_impression_bon` | Traçabilité des impressions et signatures papier |
| `trx_bon_caisse` | **Duplication** au décaissement (snapshot modifiable côté caisse, `contenu_modifie` JSON) |
| `trx_decaissement` | Décaissement effectif (bénéficiaire, pièce, montant, portefeuille) |
| `trx_operation` | Journal des mouvements (`RECHARGE`/`DECAISSEMENT`/`TRANSFERT`/`AJUSTEMENT`) |
| `trx_transfert` | Transfert inter-caisses avec conversion de devise et calcul gain/perte |
| `trx_ecriture_comptable` | **Écritures en partie double, immuables et chaînées par hash** |

**Cycle de vie d'un bon/sous-bon** (`statut`) :
`CREE → VALIDE → DECAISSE → COMPTABILISE`, avec branches `ANNULE` / `REFUSE`.

**Intégrité notable** :
- `trx_sous_bon` : `montant > 0`, unicité `(bon_id, numero_sous_bon)`.
- `trx_validation_bon` : cible **exactement** un bon *ou* un sous-bon (`CK_trx_vb_target`).
- `trx_transfert` : statuts décrivant une **saga** (`INITIE → DEBIT_SOURCE_OK → CREDIT_CIBLE_OK
  → ECRITURE_CHANGE_OK → TERMINE`, plus `COMPENSATION`/`ANNULE`) ; cible caisse **ou** portefeuille.
- `trx_ecriture_comptable` : chaque ligne est soit **débit** soit **crédit** (`CK_trx_ec_dc`),
  porte un `hash_integrite` et un `hash_precedent` → **chaînage type blockchain** garantissant
  l'inaltérabilité du grand livre ; regroupée par `transaction_uuid`.

---

## 7. Domaine `aud_` — Audit & Intégration (9 tables)

Traçabilité, *event sourcing*, fiabilité d'intégration SAP et notifications.

| Table | Rôle |
|---|---|
| `aud_journal` | Journal d'audit générique *append-only* (anciennes/nouvelles valeurs en JSON, IP, user-agent) |
| `aud_evenement_bon` | **Event sourcing** des bons (`CREE`, `MODIFIE`, `VALIDE`, `SIGNE`, `IMPRIME`, `DECAISSE`, `ANNULE`, `REFUSE`) |
| `aud_outbox` | **Pattern Outbox** pour publication fiable de messages (statut, retries, idempotence externe) |
| `aud_log_sap` | Journal des envois vers SAP (rattaché à une session et/ou un message outbox) |
| `aud_idempotency_key` | Clés d'idempotence des requêtes API (réponse cachée, expiration) |
| `aud_snapshot_journalier` | Réconciliation journalière par caisse (solde écritures vs table vs SAP, `ecart`) |
| `aud_planification_recurrence` | Planification des bons récurrents (fréquence, prochaine exécution) |
| `aud_changement_permission` | Historique des changements de permissions (source `ROLE`/`PROFIL`/`EXTRA`/`INTERIM`) |
| `aud_notification` | Notifications (canal `PUSH`/`EMAIL`/`IN_APP`, statut de lecture) |

**Réconciliation** (`aud_snapshot_journalier`) : compare le solde **recalculé depuis les écritures**,
le **solde porté en table caisse** et le **solde SAP** ; le `statut_reconciliation` vaut
`CONFORME`, `ECART_FAIBLE`, `ECART_CRITIQUE` ou `NON_RECONCILIE`. Unicité `(date_snapshot, caisse_id)`.

---

## 8. Relations principales

```
sec_direction ─┬─< sec_user >─┬─ ref_cost_center (CC principal)
               │              └─< sec_user_role >── sec_role ──< sec_role_permission >── sec_permission
               │                                    sec_profil ─< sec_profil_permission >┘
               └─< ref_site, ref_cost_center

ref_type_bon ──< trx_bon >──< trx_sous_bon >──┬── ref_partenaire
   (1 bon = N sous-bons)        │             ├── ref_cost_center / ref_nature_comptable / ref_nature_operation
                               │             ├── fin_caisse / fin_portefeuille / fin_devise
                               │             └─< trx_validation_bon, trx_impression_bon
                               │
trx_bon/sous_bon ──< trx_bon_caisse >──< trx_decaissement >── fin_portefeuille
                          │
fin_caisse ──< fin_session_caisse        fin_caisse ──< fin_portefeuille
fin_devise ──< fin_taux_echange (source, cible)
fin_caisse/portefeuille ──< trx_operation, trx_transfert
trx_ecriture_comptable ── ref_plan_comptable / ref_cost_center / fin_devise / trx_bon / trx_sous_bon

trx_bon/sous_bon ──< aud_evenement_bon ;  aud_outbox ──< aud_log_sap ;  fin_caisse ──< aud_snapshot_journalier
```

Le DDL crée l'ensemble des **clés étrangères** en fin de script (section 7), de façon idempotente.
Les domaines sont volontairement croisés (ex. `sec_user.cost_center_id → ref_cost_center`,
`fin_caisse.caissier_id → sec_user`), d'où la création des FK **après** toutes les tables.

---

## 9. Index de performance

Outre les PK clustered et les contraintes d'unicité, le schéma définit des index secondaires
ciblant les accès fréquents (section 8 du DDL) :

- **Soft-delete aware** (filtrés `WHERE deleted_at IS NULL`) : `IX_sec_user_direction`,
  `IX_trx_bon_demandeur`, `IX_trx_bon_statut` (`statut, created_at DESC`).
- **Recherche de bons** : `IX_trx_bon_type`, et sur les sous-bons `IX_trx_sb_bon`,
  `IX_trx_sb_partenaire`, `IX_trx_sb_caisse`, `IX_trx_sb_portefeuille`.
- **Grand livre** : `IX_trx_ec_transaction` (`transaction_uuid`),
  `IX_trx_ec_compte` (`compte_id, type_compte, date_ecriture`).
- **Intégration / UX** : `IX_aud_outbox_statut` (filtré sur les messages à traiter),
  `IX_aud_notif_destinataire` (file de notifications), `IX_aud_ik_expire` (purge des clés).

**Index uniques filtrés** : `UX_ref_partenaire_numero_client`, `UX_fin_session_caisse_ouverte`.

---

## 10. Données de référence (seed)

Le script initialise (idempotent) :

- **Devises** : `XOF` (FCFA, 0 décimale), `EUR`, `USD`.
- **Rôles système** : `SUPER_ADMIN`, `ADMINISTRATEUR`, `VALIDATEUR`, `DEMANDEUR`, `CAISSIER`.
- **Profils** : `CAT_VALIDATEUR`, `CAT_DEMANDEUR`, `CAT_CAISSIER`, `CAT_INTERIM`.
- **Types de bon** : `RESTITUTION_CLIENT`, `ACHAT`, `AVANCE`, `REMBOURSEMENT`.
- **Permissions** : `BON_CREER`, `BON_VALIDER`, `BON_SIGNER`, `BON_DECAISSER`, `BON_MULTI_CC`,
  `CAISSE_OUVRIR`, `CAISSE_CLOTURER`, `CAISSE_PRINCIPAL_CHOISIR`, `BON_MODIFIER_SPEC`,
  `TRANSFERT_INITIER`, `INTERIM_DECLARER`, `ADMIN_USER`, `ADMIN_ROLE`.

---

## 11. Concepts transverses à retenir

| Concept | Où / comment |
|---|---|
| **Bon léger / sous-bon métier** | `trx_bon` (enveloppe) ⟶ `trx_sous_bon` (montant, imputation, caisse) |
| **Partie double immuable** | `trx_ecriture_comptable` : débit XOR crédit, chaînage par `hash_integrite`/`hash_precedent` |
| **Saga de transfert** | `trx_transfert.statut` (étapes débit/crédit/écriture de change/compensation) |
| **Gain & perte de change** | `fin_compte_gain_change` / `fin_compte_perte_change` (1 par devise) + colonnes sur `trx_transfert` |
| **Fiabilité d'intégration** | `aud_outbox` (Outbox) + `aud_log_sap` + `aud_idempotency_key` |
| **Réconciliation** | `aud_snapshot_journalier` (écritures vs caisse vs SAP) |
| **Event sourcing** | `aud_evenement_bon` + `aud_journal` |
| **Autorisation multi-canal** | rôles + profils + permissions extra (scopées/temporisées) + intérim |
| **Soft delete + verrou optimiste** | `deleted_at`/`deleted_by_id` + `version` sur les tables métier |

---

> Document généré à partir du DDL `db_init_gestion_caisse.sql` (faisant autorité).
> En cas de divergence entre cette documentation et le script SQL, **le script prime**.
