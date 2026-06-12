# Migrations base de données

Migrations **incrémentales** appliquées sur la base existante (`DB_SYNCHRONIZE=false`, donc
TypeORM ne crée rien automatiquement). Le schéma initial complet reste `../../db_init_gestion_caisse.sql`.

## Convention
- Un fichier `.sql` par migration, nommé `NNNN_description.sql` (numéro croissant), ex. `0002_demande_recharge.sql`.
- Chaque fichier doit être **idempotent** (`IF NOT EXISTS` / `IF OBJECT_ID(...) IS NULL`) — il peut être relancé sans danger.
- Pas de `USE <base>` ni de `GO` obligatoires : la connexion cible déjà la bonne base. (Le runner sait quand même découper sur `GO` si présent.)
- Ne jamais modifier un fichier déjà appliqué : créer un **nouveau** fichier.

## Lancer les migrations
```bash
npm run migrate
```
Le runner ([../src/scripts/run-migrations.ts](../src/scripts/run-migrations.ts)) :
1. crée la table de suivi `dbo._migrations` si besoin ;
2. exécute, dans l'ordre, chaque `.sql` **non encore appliqué** (dans une transaction) ;
3. enregistre son nom pour ne pas le rejouer.

> Les anciens scripts `src/scripts/add-*.ts` correspondent à des changements **déjà appliqués**
> (historique) ; les nouvelles évolutions passent désormais par ce dossier.
