# npg_gestion_caisse

Application de gestion de Fond de Caisse (caisses, bons, portefeuilles, écritures en partie double). Référence métier : `Dossier_Conception_Fond_de_Caisse.docx`.

## Structure du dépôt

```
backend/    API NestJS 10 + TypeORM + SQL Server 2022 (schéma : db_init_gestion_caisse.sql)
frontend/   Application web Vite + React 19 + TypeScript
```

## Stack

### Backend (`backend/`)
NestJS 10, TypeORM 0.3 (driver mssql), SQL Server 2022, JWT (access + refresh), bcrypt, class-validator, Swagger.

### Frontend web (`frontend/`) — Dossier de Conception, Partie V
- **Vite + React 19 + TypeScript**
- **Tailwind CSS + shadcn/ui** (Radix)
- **TanStack Router** (routing) + **TanStack Query** (cache serveur)
- **Zustand** (état UI)
- **React Hook Form + Zod** (formulaires)
- Client API à **générer depuis l'OpenAPI** du backend (Orval) — voir `frontend/src/types/api.ts` (types manuels temporaires).

### Mobile (à venir) — Partie V §4
- **Expo (React Native)** + Expo Router, TanStack Query, Zustand, RHF + Zod, Expo SecureStore, Expo Notifications, EAS Update.
