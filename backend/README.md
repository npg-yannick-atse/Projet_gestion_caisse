# fdc-backend — API Application Fond de Caisse

Backend NestJS pour la gestion de caisse, bons et portefeuilles.
Base : SQL Server 2022, schéma `npg_gestion_caisse` (46 tables, MCD v2).

## Stack
- **NestJS 10** + TypeScript 5
- **TypeORM 0.3** + driver **mssql**
- **JWT** (access + refresh tokens) via `@nestjs/jwt` + `passport-jwt`
- **bcrypt** pour le hash des mots de passe (12 rounds)
- **class-validator** + **class-transformer** pour la validation des DTOs
- **Swagger / OpenAPI** auto-généré
- **Helmet**, **Throttler**, gestion d'exceptions centralisée

## Architecture
```
src/
├── main.ts                      # Bootstrap (Swagger, CORS, helmet, validation)
├── app.module.ts                # Module racine
├── config/                      # Configurations (app, database, jwt)
├── common/
│   ├── entities/base.entity.ts  # AuditableEntity (created/updated/deleted/version)
│   └── filters/                 # AllExceptionsFilter
├── modules/
│   ├── auth/                    # Login, refresh, JWT strategy, guards
│   ├── security/                # sec_* : users, roles, profils, permissions, interim
│   ├── referentiel/             # ref_* : partenaires, plan comptable, sites, type_bon
│   ├── financier/               # fin_* : caisses, devises, portefeuilles
│   ├── transactionnel/          # trx_* : bons, sous-bons, ecritures, transferts
│   └── audit/                   # aud_* : journal, outbox, notifications
└── health/                      # /health, /health/ready
```

## Installation

```bash
cd backend
npm install
```

## Configuration

Copier `.env.example` en `.env` et adapter :

```env
APP_PORT=3000
API_PREFIX=api/v1

DB_HOST=10.10.32.2
DB_PORT=1433
DB_USER=npg_user
DB_PASS=<mot_de_passe>
DB_NAME=npg_gestion_caisse
DB_ENCRYPT=false
DB_TRUST_SERVER_CERTIFICATE=true
DB_SYNCHRONIZE=false           # IMPORTANT : laisser false, le schema est gere par db_init_gestion_caisse.sql

JWT_SECRET=<chaine_aleatoire_64_chars>
JWT_REFRESH_SECRET=<chaine_aleatoire_64_chars>
```

> **Important** : `DB_SYNCHRONIZE=false` est obligatoire en production. Le schéma est piloté par le script DDL `../db_init_gestion_caisse.sql`, pas par TypeORM.

## Démarrage

```bash
# dev (watch)
npm run start:dev

# prod
npm run build && npm run start:prod
```

API disponible sur `http://localhost:3000/api/v1`.

## Endpoints initiaux

| Méthode | URL | Description |
|---|---|---|
| GET | `/api/v1/health` | Liveness |
| GET | `/api/v1/health/ready` | Readiness (test DB) |
| POST | `/api/v1/auth/login` | Login (matricule ou email + mot de passe) |
| POST | `/api/v1/auth/refresh` | Refresh access token |
| GET | `/api/v1/auth/me` | Profil utilisateur courant |
| POST | `/api/v1/users` | Créer un utilisateur |
| GET | `/api/v1/users` | Lister les utilisateurs |
| GET | `/api/v1/users/:id` | Détail utilisateur |
| PATCH | `/api/v1/users/:id` | Mise à jour |
| DELETE | `/api/v1/users/:id` | Soft-delete |

**Swagger UI** : `http://localhost:3000/api/v1/docs`

## Conventions importantes

- **BIGINT en string** côté JS : la précision JavaScript ne permet pas BIGINT natif, TypeORM les sérialise en string.
- **Argent en DECIMAL(19,4)** : également string côté JS pour éviter les erreurs de virgule flottante.
- **Soft-delete partout** : la colonne `deleted_at` est gérée par `@DeleteDateColumn`. Les findAll filtrent `IsNull()`.
- **Verrou optimiste** : colonne `version` via `@VersionColumn`.
- **Bon = enveloppe, Sous-bon = data** : trx_bon ne porte que `numero/statut/recurrence/type_bon_id` ; partenaire, devise, BL, montant, caisse, portefeuille vivent sur `trx_sous_bon`.

## TODO (prochaines étapes)

- [ ] Module `bons` : services + controllers + DTOs (création multi-sous-bons, validation, recurrence)
- [ ] Module `caisses` : ouverture / clôture / sessions / dashboard solde
- [ ] Module `decaissement` : duplication bon → bon_caisse, écriture comptable partie double, hash chaîné SHA-256
- [ ] Module `transfert` : saga inter-devises avec gain/perte de change
- [ ] Vues SQL `v_solde_caisse`, `v_solde_portefeuille`, `v_wallet_user`
- [ ] Worker BullMQ : outbox SAP, clôture 20h, recurrence mensuelle, snapshots journaliers
- [ ] Guards de permissions (`@RequirePermission('BON_VALIDER')`)
- [ ] Tests e2e
