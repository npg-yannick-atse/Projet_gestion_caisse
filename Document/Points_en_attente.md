# Points en attente

Sujets identifiés, volontairement laissés ouverts. Chacun indique ce qui est
déjà fait, ce qui bloque, et la décision à prendre.

Dernière mise à jour : **10/08/2026**.

---

## 0. Un code supprimé reste réservé pour toujours

**Statut : à préparer — le symptôme est traité, la cause non.**

Supprimer ne supprime pas : `deleted_at` est renseignée, la ligne reste. Or les
contraintes `UNIQUE (code)` **ne distinguent pas** une ligne vivante d'une ligne
supprimée. Un code libéré par une suppression demeure donc pris définitivement.

**Constaté deux fois le 10/08/2026 :**

- `ref_pays` — la Côte d'Ivoire, premier pays du référentiel (2236 partenaires),
  était introuvable : l'import ISO n'avait pu la recréer, son code étant retenu
  par une ligne supprimée. Débloqué au cas par cas par la migration `0049`.
- `fin_caisse` — la testeuse a créé une caisse `CAT_CAISSIER` le 05/08, l'a
  supprimée 34 secondes plus tard, et n'a pas pu la recréer le 10/08.

**Déjà fait (10/08)** : les 14 garde-fous applicatifs interrogent désormais la
base avec `withDeleted: true` et renvoient un **409 avec un message clair**
(« le code est encore occupé par une caisse supprimée ») au lieu de laisser
remonter l'erreur SQL brute « Violation of UNIQUE KEY constraint ». Verrouillé
par `caisses-code-unique.spec.ts`, validé par mutation.

Ces garde-fous étaient aveugles parce que `deleted_at` est un
`@DeleteDateColumn` : TypeORM masque les lignes supprimées par défaut, alors que
la contrainte les compte. Le code et la base n'étaient pas d'accord sur le sens
du mot « exister ».

**Ce qui reste** : le code demeure inutilisable. Le correctif de fond est un
**index unique filtré**, qui ne compte que les lignes vivantes :

```sql
CREATE UNIQUE INDEX UQ_fin_caisse_code
  ON dbo.fin_caisse(code) WHERE deleted_at IS NULL;
```

À appliquer sur toutes les tables concernées : `fin_caisse`, `fin_portefeuille`,
`ref_pays`, `ref_partenaire`, `ref_cost_center`, `ref_division`, `sec_role`,
`sec_permission`, `sec_profil`, `ref_direction`.

**Points de vigilance** : il faut supprimer l'ancienne contrainte avant de créer
l'index, vérifier qu'aucun doublon n'existe déjà parmi les lignes vivantes, et
mesurer l'effet sur les requêtes qui s'appuyaient sur l'index actuel. À faire
hors session de test.

---

## 1. Alimenter une caisse dans une devise étrangère

**Statut : à arbitrer — bloquant à l'usage.**

Depuis le passage de la devise sur le portefeuille (10/08/2026), une caisse est
officiellement **multi-devises** : chaque portefeuille porte sa devise, la caisse
n'en déclare qu'une par défaut. La recharge exige désormais que la caisse
**détienne réellement** la devise demandée, sinon elle est refusée
(`recharge.service.ts`).

**Le problème :** aujourd'hui, le seul mouvement qui crédite une caisse dans une
devise donnée est l'**encaissement client**. Il n'existe aucun moyen de déposer
des euros dans une caisse sans passer par un client.

Conséquence concrète : créer un portefeuille en EUR sur une caisse en XOF est
possible, mais **le recharger est impossible** tant que la caisse n'a pas
encaissé d'euros. Le portefeuille reste inutilisable.

**Options :**

1. **Créer un mouvement d'alimentation de caisse** (dépôt direct, hors client),
   avec une devise et un compte de contrepartie. C'est la solution complète,
   mais elle suppose de trancher la convention de partie double — encore
   ouverte (cf. §3).
2. **Passer par l'encaissement** en le documentant comme la seule porte
   d'entrée. Aucun développement, mais détourne un mouvement « client » d'un
   usage qui n'en est pas un.
3. **Restreindre les portefeuilles** aux devises déjà détenues par la caisse.
   Simple à contrôler, mais réintroduit une contrainte que l'on vient de lever.

**À décider :** comment l'argent entre physiquement dans une caisse, hors
règlement client.

---

## 2. Contrepasser les écritures négatives de juin 2026

**Statut : attend la comptabilité.**

Quatre écritures de recharge ont été passées dans une devise que la caisse ne
détenait pas, laissant des soldes négatifs :

| Caisse | Devise | Montant | Date | Portefeuille (supprimé depuis) |
|---|---|---|---|---|
| CI01 | EUR | 50 000 | 03/06/2026 | `DUS` Portefeuille Usine |
| CI01 | EUR | 125 000 | 04/06/2026 | `DUS` Portefeuille Usine |
| CI02 | USD | 1 | 29/06/2026 | `TEST` |
| CI02 | USD | 1 | 29/06/2026 | `TEST2` |

Soit **−175 000 EUR sur CI01** et **−2 USD sur CI02**.

**Rien n'est perdu** : chaque opération est équilibrée (débit caisse = crédit
portefeuille). C'est une erreur d'étiquette de devise, pas de montant.

**La cause est corrigée** : la recharge contrôle désormais la solvabilité par
devise, et les trois portefeuilles fautifs sont supprimés.

**Ce qui reste :** le grand livre étant immuable (hash chaîné SHA-256), on ne
supprime pas une écriture — on en passe une de correction. Cela suppose un
compte de contrepartie, donc la convention de partie double (§3).

**À décider :** contrepasser, ou laisser la trace historique. Les montants sont
faibles.

---

## 3. Convention de partie double pour les écritures de correction

**Statut : ouvert depuis le 28/05/2026.**

Seuls quatre `type_compte` existent : `CAISSE`, `PORTEFEUILLE`, `GAIN_CHANGE`,
`PERTE_CHANGE`. Il n'y a **ni compte de charge, ni compte de tiers**, donc
aucune contrepartie disponible pour une écriture qui ne serait pas un simple
transfert interne.

Bloque les points 1 et 2 ci-dessus, ainsi que la génération d'écritures au
décaissement (volontairement non implémentée).

---

## 4. Division du client : importer `KNVV.VWERK`

**Statut : chantier chiffré, non démarré.**

Les divisions correspondent aux **sites SAP `T001W`** (champ `WERKS`) —
confirmé le 05/08/2026, les 10 sites NPG sont en base depuis la migration
`0050`. Le lien vers le client existe dans SAP : **`KNVV.VWERK`**. L'import
actuel ne lit que `KNA1` (numéro, nom, ville, pays), donc ce lien n'est pas
rapatrié.

**Mesuré sur les données réelles** (2300 lignes KNVV / 1601 clients) :

- aucun client sans division ;
- **432 clients (27 %) relèvent de plusieurs divisions**, jusqu'à quatre.

Un pré-remplissage automatique couvrirait donc **73 %** des clients ; pour les
27 % restants, il faudrait proposer une liste réduite à leurs divisions au lieu
des dix.

**Travail :** table de liaison client ↔ divisions (relation 1 à N), extension de
la synchro SAP, exposition côté API, puis usage dans les formulaires web et
mobile.

> ⚠️ `RFC_READ_TABLE` lit séquentiellement : un échantillon de 400 lignes ne
> renvoyait que des `SS11` et laissait croire à un lien unique. Toujours lire
> `ROWCOUNT: 0` avant de conclure sur une répartition.

---

## 5. Nommage interne « SAP » sur la création de bon

**Statut : cosmétique, sans impact utilisateur.**

Les libellés visibles ont été corrigés le 10/08/2026 : l'écran n'annonce plus
une vérification SAP quand seul le client est exigé (il est cherché dans le
référentiel local, sans appel SAP).

En interne en revanche, `verifierSapAvantEnvoi` et l'état `sapCheck`
(`BonCreatePage.tsx`) couvrent aussi le contrôle local. À renommer pour que le
code raconte la même histoire que l'écran.

---

## 6. Les avances sur salaire ne sont jamais récupérées

**Statut : à arbitrer — de l'argent dû n'est tracé nulle part.**

L'avance existe sous **deux formes**, et aucune n'est récupérée :

- **Type de bon `AVANCE`** — un décaissement pur, sans partenaire ni client.
  **4 bons** déjà créés.
- **Type de bénéfice `AVANCE` (« Avance sur salaire »)** — enregistre un droit,
  ne prélève rien.

Le paiement du salaire ne retient **que** les mensualités d'un `fin_credit` dont
le prélèvement a été autorisé. Ni les avances ni les bénéfices n'entrent dans le
calcul. Un employé qui prend une avance de 200 000 le 15 touche donc son salaire
**entier** le jour de la paie.

**La configuration, elle, a été pensée pour la retenue** — et elle est intacte :

```
AVANCE · jour_min_mois = 15 · plafond_pourcentage_salaire = 50 %
```

Ces deux règles n'ont de sens que si l'avance est reprise sur la paie suivante :
on n'avance que sur un demi-mois **déjà travaillé**, et le plafond à 50 % garantit
que la retenue tient **sur une seule paie** en laissant la moitié du salaire à
l'employé. Un crédit, lui, n'a ni jour minimum ni plafond, parce qu'il s'étale.

**Comparaison avec le crédit :**

| | Crédit | Avance |
|---|---|---|
| Table dédiée | `fin_credit` | ❌ |
| Échéancier | ✅ | ❌ |
| Prélèvement sur salaire | ✅ | ❌ |
| Replanification | ✅ | ❌ |
| Écran de suivi | ✅ | ❌ |

**Deux mises en œuvre possibles :**

1. **Réutiliser le crédit** avec `nbMois = 1`. Tout existe déjà — autorisation de
   prélèvement, retenue à la paie, salaire insuffisant, replanification. Aucune
   logique neuve. *Réserve* : impose le circuit d'approbation du DAF à chaque
   avance, peut-être lourd pour un geste courant et plafonné.
2. **Une retenue dédiée** : l'avance produit une ligne « à retenir sur la
   prochaine paie », sans approbation. Plus léger à l'usage, mais c'est un second
   mécanisme à écrire et à tester.

Recommandation : commencer par (1). Le comportement est éprouvé ; alléger ensuite
si le circuit s'avère trop lourd coûte moins que l'inverse.

**Questions ouvertes :**

1. **L'approbation du DAF est-elle requise pour une avance**, ou doit-elle
   pouvoir être accordée directement ? C'est ce qui départage les deux options.
2. **Les 4 avances déjà décaissées ont-elles été récupérées ?** Si non, c'est une
   créance que l'application ne suit pas, et il faudra décider comment la
   régulariser.
