# Test des droits, rôle par rôle

Vérifie **en appelant l'API réelle** que chaque rôle peut faire exactement ce que
ses permissions autorisent — ni plus, ni moins.

Écrit le 12/08/2026. Premier passage : **256 appels (8 rôles × 32 actions),
0 écart.**

## Pourquoi ces scripts existent

Aucun compte réel ne porte un seul rôle : **quatre des huit utilisateurs portent
les sept rôles à la fois**, donc ils sont administrateurs et contournent tout
contrôle. C'est exactement ce qui avait laissé passer le défaut « aucun caissier
ne pouvait travailler » (commit `518feb4`) : personne ne testait jamais un
caissier qui ne soit pas aussi admin.

Ces scripts créent donc des comptes **à rôle unique**, jetables.

## Comment ça marche

L'authentification ne passe pas par le LDAP : `JwtStrategy.validate()` renvoie
le jeton tel quel, sans consulter la base. Un jeton signé avec le `JWT_SECRET`
de `backend/.env` suffit donc à appeler l'API au nom de n'importe quel compte.

L'**attendu** n'est jamais deviné : il est recalculé depuis `sec_role_permission`
en rejouant les règles d'`AuthorizationService` (bypass administrateur,
dépliage DAF → ADMINISTRATEUR + CAISSIER, mode strict sans bypass).

Le **constaté** vient du vrai code HTTP : `401`/`403` = refusé, tout le reste =
la garde a laissé passer, même si l'action échoue ensuite pour une raison
métier (`400`, `404`, `409`) — le contrôle d'accès s'exécute avant.

## Mode d'emploi

Démarrer une instance dédiée pour ne pas perturber celle qui sert :

```bash
cd backend
APP_PORT=8091 DB_LOGGING=false npm run start
```

Puis, depuis ce dossier :

```bash
node roles-1-creer.js       # 7 comptes TEST-ROLE-* + 1 témoin sans rôle
node roles-2-tester.js      # la matrice ; écrit resultats.json
node roles-3-inventaire.js  # ce que le test a créé (lecture seule)
node roles-4-nettoyer.js    # TOUT supprimer, en une transaction
```

Puis vérifier que le grand livre n'a pas souffert :

```bash
cd ../../backend
npx ts-node -r tsconfig-paths/register src/scripts/verifier-grand-livre.ts
```

## À savoir avant de lancer

- **C'est la base de PRODUCTION.** `roles-2-tester.js` exécute réellement les
  actions autorisées : il crée des opérations, des écritures comptables, des
  lignes de référentiel. `roles-4-nettoyer.js` les retire — **le lancer est
  obligatoire**, pas optionnel.
- Un refus (`403`) n'écrit rien : toute la moitié « interdit » du test est sans
  risque. Le risque ne vient que de la moitié « autorisé ».
- Supprimer une transaction entière du grand livre est sans danger : la chaîne
  de hash est **par transaction**, pas globale.
- Le test laisse aussi une empreinte dans `aud_journal` (~87 lignes), que le
  nettoyage retire.

## Ajouter une action à tester

Une ligne dans `roles-actions.js` :

```js
{ id: 'creer-truc', m: 'POST', url: '/trucs', permission: 'TRUC_GERER',
  strict: false, ecrit: true, body: () => ({ ... }) }
```

- `permission: null` = ouverte à tout authentifié (règle des lectures annuaire).
- `strict: true` = `assertPermissionStrict`, aucun bypass administrateur.
- Vérifier la permission exigée **dans le code** (`assertPermission…`), pas de
  mémoire : trois « écarts » du premier passage venaient de mes propres
  hypothèses fausses, pas du code.
- Vérifier aussi l'URL réelle dans le log de démarrage (`Mapped {…}`) et le
  corps attendu par le DTO : une route inexistante rend `404`, un corps invalide
  rend `400` — dans les deux cas la garde n'est **jamais atteinte** et le test
  ne prouve rien.
