# Points en attente

Sujets identifiés, volontairement laissés ouverts. Chacun indique ce qui est
déjà fait, ce qui bloque, et la décision à prendre.

Dernière mise à jour : **10/08/2026**.

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
