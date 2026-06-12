# Fond de Caisse — Mobile (Expo / React Native)

Application mobile du projet, conforme au **Dossier de conception — Partie I §2 (Module Mobile)** :
créer une demande de bon, valider un bon, marquer un bon comme récurrent.

> **Itérations livrées :**
> 1. Socle (Expo Router, client API, store auth sécurisé) + **connexion LDAP** via le backend.
> 2. **Mes bons** : liste des bons de l'utilisateur (statut, montant, date, pull-to-refresh).
> 3. **Créer une demande de bon** : formulaire (type, portefeuille → caisse/devise dérivées, centre de coût, partenaire, montant, BL, manutention, porteur, récurrent) → `POST /bons`.
> 4. **Valider un bon** : détail du bon + sous-bons, file « À valider », **Valider / Refuser** (+ commentaire) → `POST /bons/:id/validate`.
>
> ✅ Les **3 fonctions du Module Mobile** du Dossier (créer / valider / marquer récurrent) sont couvertes.

## Stack
- **Expo SDK 52** (React Native 0.76) + **expo-router** (navigation par fichiers)
- **axios** (client API → NestJS), **zustand** (état), **@tanstack/react-query**
- **expo-secure-store** (stockage chiffré du token)

## Configuration de l'API
L'URL du backend est dans `app.json` → `expo.extra.apiUrl` (défaut `http://10.10.32.2:8080/api/v1`).
Surcharge possible via la variable d'env `EXPO_PUBLIC_API_URL`.

> ⚠️ Sur un **téléphone physique**, le device doit pouvoir joindre le serveur : utilise l'**IP LAN**
> (ex. `10.10.32.2:8080`), pas `localhost`. Vérifie aussi que le port 8080 est accessible sur le réseau.

## Démarrer
```bash
cd mobile
npm install            # (ou: npx expo install --fix  pour aligner les versions Expo)
npm start              # ouvre Expo ; scanne le QR code avec l'app Expo Go
# ou : npm run android   /   npm run ios
```

## Structure
```
mobile/
  app/                          # routes (expo-router)
    _layout.tsx                 # providers (QueryClient, SafeArea) + bootstrap du token
    login.tsx                   # connexion (LDAP via /auth/login)
    (app)/                      # espace authentifié (garde de token)
      _layout.tsx               # Stack : les onglets + le détail par-dessus
      (tabs)/                   # navigation par ONGLETS du bas
        _layout.tsx             # Tabs : Mes bons · À valider · Nouveau · Compte
        index.tsx               # 🧾 Mes bons
        a-valider.tsx           # ✅ File de validation
        nouveau.tsx             # ➕ Créer une demande
        compte.tsx              # 👤 Profil + déconnexion
      bons/[id].tsx             # détail d'un bon + validation (poussé au-dessus des onglets)
  src/
    lib/config.ts               # URL de l'API
    lib/api.ts                  # axios + bearer token + 401 → logout
    lib/format.ts               # montant/date + badges de statut
    store/auth.ts               # session persistée (expo-secure-store)
    api/auth.ts | bons.ts | referentiel.ts
    components/Select.tsx        # sélecteur (modale)
    types.ts                     # types partagés avec le backend
```

## Pistes d'amélioration (post-MVP)
- Plusieurs **sous-bons** à la création (actuellement 1 par demande).
- **Notifications push** (bons à valider).
- Onglets de navigation (Mes bons / À valider) au lieu des liens d'en-tête.
- Relance du **renouvellement mensuel** des bons récurrents en un clic.
