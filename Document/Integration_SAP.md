# Intégration SAP — Mouvements & BAPI

**Projet :** Fond de Caisse (NPG Gandour)
**Objet :** cartographier les mouvements de l'application, décider lesquels partent vers SAP,
et lister les BAPI à utiliser (écriture comptable **et** vérification de données).

> Basé sur le code de l'application + le `Guide_Connexion_SAP_NCo.docx`
> (connectivité RFC validée le 13/07/2026).

---

## 0. Contexte technique SAP (rappel du guide)

- **Protocole** : RFC. Depuis un poste Windows via **SAP .NET Connector (NCo 3.1 x64)** ;
  depuis le backend Node.js via **node-rfc** (mêmes paramètres de connexion).
- **SAP** : ECC (R/3 **Basis 7.31**) — *pas* S/4HANA → les `BAPI_CUSTOMER_*` classiques s'appliquent
  (le client est un compte client KUNNR, pas un Business Partner).
- **Mandant** : 100 partout. **Port** = `33` + n° de système.
- **Autorisation requise** du compte technique : **`S_RFC`**.
- **Systèmes validés :**

  | Système | Hôte (ashost) | Sysnr | Port | Utilisateur | Statut |
  |---|---|---|---|---|---|
  | DN0 | 10.10.2.40 | 00 | 3300 | GIMAD | validé (données présentes) |
  | DS4 | dqerp (10.10.2.140) | 01 | 3301 | KOLIVIER | validé (0 donnée) |
  | PN0 (prod) | 10.10.2.42 | 00 | 3300 | SYSAUTO | validé |
  | CLONE | 10.200.200.200 | 00 | 3300 | SYSAUTO | à tester |

- **BAPI custom déjà testée** (lecture) : `ZBAPI_CMD_ACHAT_LIVR_FINALE`
  (extraction de commandes d'**achat** non livrées → tables `ZZCMD_NON_LIV`, `ZZDETAIL_CMD_NON_LIVR`…).
  → Dans ce contexte, **« commande » = commande d'ACHAT (module MM)**.
- **Secrets** : `sap.env` / `test-sap.ps1` sont hors git ; mot de passe jamais en dur (variables d'env / coffre).

---

## 1. Les mouvements de l'application

Chaque mouvement = une **opération** (`trx_operation`) + ses **écritures en partie double**
(`trx_ecriture_comptable`, colonnes `debit`/`credit`, avec `plan_comptable_id` = compte GL et `cost_center_id`).

| Type d'opération | Nature | Sens | Comptes en jeu | Impact comptable |
|---|---|---|---|---|
| **ENCAISSEMENT** | Entrée d'argent externe dans une caisse | 🟢 IN | RECETTE → CAISSE | **Oui** (recette) |
| **DECAISSEMENT** | Paiement d'un bon | 🔴 OUT | CAISSE/PORTEFEUILLE → CHARGE | **Oui** (charge) |
| **CREDIT** | Décaissement d'une avance / crédit employé | 🔴 OUT | CAISSE → CREDIT_EMPLOYE (créance) | **Oui** (créance) |
| **RECHARGE** | Caisse → portefeuille (enveloppe budgétaire) | ⚪ interne | CAISSE ↔ PORTEFEUILLE | Non (interne) |
| **TRANSFERT** | Entre portefeuilles / caisses | ⚪ interne | PORTEFEUILLE ↔ PORTEFEUILLE | Non (interne) |
| **AJUSTEMENT** | Corrections, **reset budget mensuel** | ⚪ interne | CAISSE ↔ PORTEFEUILLE | Non (budgétaire) |

**Types de compte disponibles** (`type_compte`) : `CAISSE`, `PORTEFEUILLE`, `CHARGE`, `RECETTE`,
`CREDIT_EMPLOYE`, `GAIN_CHANGE`, `PERTE_CHANGE`.

> Chaque transaction (`transaction_uuid`) regroupe ses lignes débit/crédit →
> **1 transaction = 1 pièce comptable SAP** prête à poster.

---

## 2. Ce qui doit partir vers SAP

SAP = grand livre de référence. On poste **ce qui a un impact comptable réel**.

### ✅ À envoyer (postings)
- **ENCAISSEMENT** → recette : *débit* caisse/banque / *crédit* compte de produit.
- **DECAISSEMENT** → charge : *débit* charge (+ centre de coût) / *crédit* caisse/banque.
- **CREDIT employé** → créance : *débit* compte créance employé / *crédit* caisse ;
  au **remboursement / solde**, l'écriture inverse.
- **Écarts de change** (`GAIN_CHANGE` / `PERTE_CHANGE`) si multidevises.

### ❌ À NE PAS envoyer (interne, aucun impact grand livre)
- **RECHARGE** (caisse → enveloppe budgétaire).
- **TRANSFERT** entre portefeuilles.
- **AJUSTEMENT** de budget mensuel (reset).

> ⚠️ **Décision à valider avec la comptabilité** : si les **caisses / banques sont des comptes SAP distincts**,
> un mouvement caisse↔caisse (ou caisse↔banque) doit être posté comme **virement interne**.
> Le mapping « portefeuille/caisse de l'appli → compte GL SAP » dépend du plan comptable SAP.

---

## 3. BAPI d'ÉCRITURE (poster les mouvements comptables)

| BAPI | Rôle |
|---|---|
| **`BAPI_ACC_DOCUMENT_POST`** | **Principale** — poste une pièce FI (G/L, fournisseur, client) : lignes débit/crédit, comptes GL, centres de coût, devise. Couvre encaissement / décaissement / crédit. |
| **`BAPI_ACC_DOCUMENT_CHECK`** | Valide la pièce **avant** post (contrôle à blanc) → évite les rejets. |
| **`BAPI_ACC_DOCUMENT_REV_POST`** | **Contrepassation** d'une pièce déjà postée → pour les annulations / corrections. |
| **`BAPI_TRANSACTION_COMMIT` / `_ROLLBACK`** | **Obligatoire** après chaque post (les BAPI FI ne committent pas seules). |
| `BAPI_ACC_DOCUMENT_RECORD_GET` *(option)* | Relire / vérifier une pièce postée. |

**Mapping mouvement → BAPI :**

| Mouvement app | Action SAP | BAPI |
|---|---|---|
| ENCAISSEMENT / DECAISSEMENT / CREDIT | poster la pièce | `BAPI_ACC_DOCUMENT_POST` (+ `_CHECK` avant) |
| Annulation d'un de ces mouvements | contrepasser | `BAPI_ACC_DOCUMENT_REV_POST` |
| RECHARGE / TRANSFERT / AJUSTEMENT budget | — (interne) | *aucun* |
| Après chaque post | valider | `BAPI_TRANSACTION_COMMIT` |

---

## 4. BAPI de LECTURE / VÉRIFICATION (contrôle des données saisies)

Appels **en lecture seule** (pas de `COMMIT`), à faire **pendant la saisie** pour valider/auto-compléter.

### 4.1 Vérifier un CLIENT (code / nom)
| Besoin | BAPI | Entrée → Sortie |
|---|---|---|
| **Code client → détails (dont nom)** | `BAPI_CUSTOMER_GETDETAIL2` | n° client (KUNNR) → raison sociale, adresse… |
| **Nom / critères → retrouver le code** | `BAPI_CUSTOMER_GETLIST` ou `BAPI_CUSTOMER_FIND` | nom, ville… → liste clients + codes |
| **Le client existe-t-il ?** | `BAPI_CUSTOMER_EXISTENCECHECK` | n° client → OK / erreur |

→ *Usage* : l'agent saisit le **code client** → `BAPI_CUSTOMER_GETDETAIL2` → **auto-remplit et verrouille le nom**.

### 4.2 Vérifier un NUMÉRO DE COMMANDE
**Commande d'ACHAT (MM / PO)** — cas de NPG (cf. `ZBAPI_CMD_ACHAT_LIVR_FINALE`) :
| Besoin | BAPI |
|---|---|
| Détail d'un bon de commande | `BAPI_PO_GETDETAIL1` (postes : `BAPI_PO_GETITEMS`) |
| Existence / extraction filtrée | BAPI custom **`ZBAPI_CMD_ACHAT_LIVR_FINALE`** (déjà en place) ou une Z dédiée « check commande » |

**Commande CLIENT (SD / sales order)** — si un jour on gère des commandes de vente :
| Besoin | BAPI |
|---|---|
| Détail d'une commande | `BAPI_SALESORDER_GETDETAILBOS` / `BAPISDORDER_GETDETAILEDLIST` |
| Commandes d'un client | `BAPI_SALESORDER_GETLIST` |
| Statut d'une commande | `BAPI_SALESORDER_GETSTATUS` |

### 4.3 Cohérence commande ↔ client
- `BAPI_PO_GETDETAIL1` (achat) / `BAPI_SALESORDER_GETDETAILBOS` (vente) renvoient le **partenaire** de la commande
  → vérifier qu'il correspond au client/fournisseur saisi.

### 4.4 Récapitulatif « ce qui se passe ici »
| Champ saisi dans l'appli | Contrôle SAP | BAPI |
|---|---|---|
| Code client | existe + récupère le nom | `BAPI_CUSTOMER_GETDETAIL2` / `_EXISTENCECHECK` |
| Nom client (recherche) | retrouve le code | `BAPI_CUSTOMER_GETLIST` / `_FIND` |
| N° commande d'achat | existe + détail | `BAPI_PO_GETDETAIL1` / `ZBAPI_CMD_ACHAT_LIVR_FINALE` |
| N° commande client (vente) | existe + détail + statut | `BAPI_SALESORDER_GETDETAILBOS` / `_GETSTATUS` |
| Commande ↔ partenaire | cohérence | détail commande (partenaire) |

---

## 5. Ce qu'il reste à faire côté application

Aucun code SAP n'existe encore dans l'appli. Pour l'intégration, prévoir :

1. **Flag d'export SAP** sur `trx_operation` : `sap_document_number`, `sap_statut`
   (`A_ENVOYER` / `ENVOYE` / `ERREUR`), `sap_date`, `sap_message` → **idempotence** (jamais de double post).
2. **Table de mapping** compte app → compte GL SAP (par `type_compte` / `plan_comptable`), + société (Bukrs) + devise.
3. **Service d'export** (backend, node-rfc) :
   - file des transactions comptables non postées → `BAPI_ACC_DOCUMENT_CHECK` puis `BAPI_ACC_DOCUMENT_POST`
     → `BAPI_TRANSACTION_COMMIT` → stocke le n° de pièce SAP.
   - annulations → `BAPI_ACC_DOCUMENT_REV_POST`.
4. **Validation à la saisie** (lecture) : brancher les BAPI du §4 sur les champs code client / nom client / n° commande.
5. **Config connexion** : réutiliser les paramètres du guide (ashost/sysnr/client/user/S_RFC),
   secrets via variables d'environnement (jamais en dur).

---

## 6. Points à trancher (métier)

- [ ] **Société(s) SAP (Bukrs)** et **plan comptable** cible → mapping des comptes.
- [ ] Les **caisses/banques** sont-elles des comptes SAP distincts ? (⇒ poster ou non les mouvements internes).
- [ ] Le **numéro de commande** à contrôler = **achat** (confirmé par la Z BAPI) — confirmer qu'il n'y a pas aussi du **vente**.
- [ ] **Système cible** de production pour l'écriture : **PN0** (prod) — quel compte technique et quels droits de POST (au-delà de S_RFC : autorisations FI d'écriture) ?

---

## 7. État — ce qui est FAIT et PROUVÉ (testé sur le clone PN0, plan PCGG)

Intégration **opérationnelle dans l'application** (backend node-rfc + page « SAP (test) ») :

| Fonction | BAPI | Statut |
|---|---|---|
| Connexion RFC | STFC_CONNECTION | ✅ |
| Vérifier un **client** | `BAPI_CUSTOMER_GETDETAIL2` | ✅ nom (`CUSTOMERADDRESS.NAME`), ville, pays, n° fiscal (`CUSTOMERGENERALDETAIL.VAT_REG_NO`) |
| Vérifier une **commande d'achat** | `BAPI_PO_GETDETAIL1` | ✅ type (`DOC_TYPE`), fournisseur (`VENDOR`) ou usine source (`SUPPL_PLNT` si UB=transfert), société, devise, date, statut |
| Nom **fournisseur** | `BAPI_VENDOR_GETDETAIL` | ✅ (best-effort) |
| Lister des **comptes GL** | `RFC_READ_TABLE` (SKB1 + SKAT) | ✅ société 2251, plan PCGG |
| **Contrôler** une pièce | `BAPI_ACC_DOCUMENT_CHECK` | ✅ |
| **Poster** une pièce | `BAPI_ACC_DOCUMENT_POST` + `BAPI_TRANSACTION_COMMIT` | ✅ **pièce créée** : BELNR **0100351474** / société **2251** / exercice **2026** |
| **Contrepasser** | `BAPI_ACC_DOCUMENT_REV_POST` | ✅ |
| **Envoyer une opération** de l'appli → SAP | (compose POST) | ✅ avec **idempotence** (`sap_piece`/`sap_statut` sur `trx_operation`, migration 0029) |

### Recette de posting qui fonctionne
- **DOCUMENTHEADER** : `USERNAME`, `COMP_CODE`=2251, `DOC_DATE`, `PSTNG_DATE`, `DOC_TYPE`=SA, `BUS_ACT`=RFBU, `REF_DOC_NO`.
- **ACCOUNTGL** (par ligne) : `ITEMNO_ACC`, `GL_ACCOUNT` (10 car., complété de zéros), `ITEM_TEXT` (**obligatoire** pour certains comptes — ex. 10130000), `COSTCENTER`.
- **CURRENCYAMOUNT** (par ligne) : `ITEMNO_ACC`, `CURR_TYPE`=00, `CURRENCY`=XOF, `AMT_DOCCUR` (**débit positif, crédit négatif**).
- **Contraintes réelles observées** : le compte **10130000 exige un texte de ligne** ; le **centre de coût doit exister** (ex. `22100` invalide) → laisser vide si non requis.

---

## 8. À DEMANDER à l'équipe SAP (liste précise)

1. **Compte technique** dédié + **autorisation FI d'écriture** (posting) sur **PN0 prod** et un système de test (au-delà de `S_RFC` : `F_BKPF_BUK`, `F_BKPF_KOA`…).
2. **Mapping comptable** (plan **PCGG**, société **2251**) :
   - Encaissement → compte **produit/recette** + compte **caisse/banque**
   - Décaissement → compte **charge** (+ centre de coût) + compte **caisse/banque**
   - Crédit employé → compte **créance personnel** + compte **caisse/banque**
3. **Type de pièce** (Belegart) à utiliser pour chaque cas (test avec `SA`).
4. **Centres de coût** valides pour 2251 (et la correspondance avec nos directions/cost-centers).
5. Les **caisses/banques** = comptes SAP distincts ? (⇒ poster ou non les mouvements internes).
6. Confirmer : commandes **achat uniquement** (UB/NB/Z0NB) ou aussi **vente** (SD) ?
7. Autoriser **`RFC_READ_TABLE`** (lecture SKB1/SKAT) **ou** fournir directement la **liste des comptes**.
8. Contacts : **correspondant FI** + **correspondant Basis**.

---

## 9. FICHE À REMETTRE À LA COMPTA — comptes PCGG exacts (société 2251)

> **Contexte** : l'application « Fond de Caisse » poste ses mouvements en comptabilité SAP
> (société **2251**, plan **PCGG**, connexion RFC déjà validée). Merci d'indiquer, pour chaque
> ligne, le **numéro de compte général** à utiliser. Le plan PCGG étant custom (non SYSCOHADA
> standard), nous ne pouvons pas deviner les comptes — d'où cette fiche.

### A. Général
- **Société (Bukrs)** = **2251** → à confirmer : ☐
- **Type de pièce (Belegart)** à utiliser pour ces écritures : ______ (testé avec `SA`)
- **Devises gérées** : **XOF, EUR, USD** → besoin des comptes d'**écart de change** (§F).

### B. Trésorerie — caisses & banque
Caisses de l'appli : **CI02 (Caisse Principale), CI01 (Caisse L), 66566 (OLI)**.
- Chaque caisse = un **compte SAP distinct** ? ☐ OUI ☐ NON
  - Si **OUI** → CI02 : __________ · CI01 : __________ · 66566 : __________
  - Si **NON** → un seul compte **Caisse** : __________
- Compte **Banque** (adossé aux portefeuilles) : __________

### C. Encaissements (argent qui ENTRE)
Écriture : **DÉBIT caisse/banque** (§B) / **CRÉDIT produit**.
- Compte de **produit / recette** à créditer : __________
- Un seul compte, ou **plusieurs selon la nature** de l'encaissement ? ______________

### D. Décaissements / BONS (argent qui SORT)
Écriture : **DÉBIT charge (ou tiers)** / **CRÉDIT caisse/banque** (§B).
Types de bon : **ACHAT, AVANCE, REMBOURSEMENT, RESTITUTION_CLIENT** ; natures : **billet d'avion, rechargement internet**.
Compte à **débiter**, par type / nature :

| Type / nature du bon | Compte à débiter |
|---|---|
| Bon **ACHAT** (général) | __________ |
| Nature **billet d'avion** (voyages / déplacements) | __________ |
| Nature **rechargement internet** (télécom) | __________ |
| Bon **AVANCE** | __________ |
| Bon **REMBOURSEMENT** | __________ |
| Bon **RESTITUTION_CLIENT** (compte client / dette ?) | __________ |

> Un seul compte de charge pour tous ? → une seule ligne suffit. Comptes **différents par type/nature** ?
> → l'appli sera étendue pour un **mapping par nature** (nous le prévoyons).

### E. Crédits / avances au personnel
Écriture : **DÉBIT créance personnel** / **CRÉDIT caisse**.
- Compte de **créance / avance au personnel** : __________
- (Au **remboursement** du crédit : écriture inverse, même compte.)

### F. Écarts de change (multidevise XOF / EUR / USD)
- Compte **GAIN de change** : __________
- Compte **PERTE de change** : __________

### G. Centres de coût
- Correspondance entre nos **directions / centres de coût** (app) et les **centres de coût SAP** valides pour 2251.
  *(À noter : un centre invalide bloque le posting — ex. « 22100 » n'existe pas.)*

### H. Autorisations
- Le **compte technique RFC** doit pouvoir **poster en FI** sur 2251 (au-delà de `S_RFC` :
  `F_BKPF_BUK`, `F_BKPF_KOA`…) → confirmer l'habilitation, et sur quel **système** (test vs prod PN0).

---

### Récapitulatif « minimum pour démarrer » (5 comptes)
| # | Compte demandé | Sert à |
|---|---|---|
| 1 | **Caisse** (espèces) | encaissements / décaissements espèces |
| 2 | **Banque** | mouvements via portefeuille |
| 3 | **Produit / recette** | encaissements |
| 4 | **Charge** (au moins un) | décaissements / bons |
| 5 | **Créance personnel** | crédits / avances |

*(+ gain/perte de change si multidevise ; + un compte par caisse/nature si la compta le souhaite.)*
