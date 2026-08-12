/* ============================================================================
   Taux de change : alimentation par une API de cotation en ligne
   Base : npg_gestion_caisse (SQL Server) — idempotent.

   DÉCISION (11/08/2026)
   ---------------------
   La source retenue n'est PAS SAP mais une API publique. Motif : les cours de
   TCURR sont saisis à la main et sporadiquement — le dernier USD/FCFA relevé
   datait du 15/12/2025, soit huit mois. Un cours de huit mois affiché comme
   courant est un mensonge d'écran.

   Source retenue : `open.er-api.com` — gratuite, sans clé, 166 devises, XOF
   compris, mise à jour quotidienne. Recoupée le 11/08/2026 : la parité EUR/XOF
   qu'on en déduit vaut 655,9616 contre 655,957 officiels, soit 0,0007 % — du
   bruit d'arrondi. L'API est donc cohérente avec l'accord monétaire.

   À SAVOIR : ses cours s'écartent de SAP d'environ 5,6 % sur l'USD. Sans
   conséquence comptable — la conversion reste de l'AFFICHAGE et ne produit
   aucune écriture — mais les totaux consolidés ne coïncideront pas avec un
   état SAP. C'est assumé : l'API dit le cours du jour, SAP celui de décembre.

   ------------------------------------------------------------------------
   1) PARITÉ FIXE : le drapeau qui protège l'EUR -> XOF

   1 EUR = 655,957 XOF par accord monétaire. Ce n'est pas une cotation, c'est
   une constante. Importer ce couple depuis l'API le remplacerait par du bruit
   quotidien autour de la vraie valeur, et ouvrirait une nouvelle période
   chaque jour pour un taux qui ne bouge jamais.

   `parite_fixe` marque ces couples. L'import automatique les ignore ; seule
   une saisie humaine peut les changer.
   ------------------------------------------------------------------------ */
SET NOCOUNT ON;

IF COL_LENGTH('dbo.fin_taux_echange', 'parite_fixe') IS NULL
    ALTER TABLE dbo.fin_taux_echange
        ADD parite_fixe BIT NOT NULL CONSTRAINT DF_fin_te_parite_fixe DEFAULT 0;
GO

/* EUR -> XOF : la seule parité fixe du référentiel à ce jour. */
UPDATE t
SET t.parite_fixe = 1
FROM dbo.fin_taux_echange t
JOIN dbo.fin_devise s ON s.id = t.devise_source_id AND s.code = N'EUR'
JOIN dbo.fin_devise c ON c.id = t.devise_cible_id  AND c.code = N'XOF'
WHERE t.parite_fixe = 0;
GO

/* ---------------------------------------------------------------------------
   2) Réglages de l'import

   TAUX_API_ENABLED est à 'false' délibérément : l'accès Internet du SERVEUR
   n'est pas vérifié (le test du 11/08 a été fait depuis un poste de
   développement, pas depuis l'hôte du backend, et les réseaux d'entreprise
   filtrent souvent les sorties). L'import se déclenche donc à la main tant que
   personne n'a confirmé que le serveur joint l'API.

   TAUX_API_URL porte {BASE}, remplacé par le code de la devise de base au
   moment de l'appel : l'URL reste lisible en base et modifiable sans
   redéploiement, comme les paramètres de clôture automatique (migration 0033).
   --------------------------------------------------------------------------- */
INSERT INTO dbo.app_parametre(cle, valeur, libelle)
SELECT v.cle, v.valeur, v.libelle
FROM (VALUES
    (N'TAUX_API_ENABLED', N'false',
     N'Import automatique des taux : activé (true / false)'),
    (N'TAUX_API_URL', N'https://open.er-api.com/v6/latest/{BASE}',
     N'Import des taux : URL de l''API ({BASE} = code de la devise de base)'),
    (N'TAUX_API_HEURE', N'6',
     N'Import automatique des taux : heure de déclenchement (0-23, heure Côte d''Ivoire)'),
    (N'TAUX_API_DEVISES', N'USD',
     N'Import des taux : codes ISO à rapatrier, séparés par des virgules (hors parités fixes)')
) AS v(cle, valeur, libelle)
WHERE NOT EXISTS (SELECT 1 FROM dbo.app_parametre p WHERE p.cle = v.cle);
GO

/* --- Contrôle : la parité fixe doit être protégée ------------------------- */
IF NOT EXISTS (
    SELECT 1
    FROM dbo.fin_taux_echange t
    JOIN dbo.fin_devise s ON s.id = t.devise_source_id AND s.code = N'EUR'
    JOIN dbo.fin_devise c ON c.id = t.devise_cible_id  AND c.code = N'XOF'
    WHERE t.parite_fixe = 1 AND t.date_validite_fin IS NULL AND t.deleted_at IS NULL
)
    THROW 50056, N'0056 : la parité fixe EUR->XOF n''est pas marquée, l''import pourrait l''écraser.', 1;
GO

PRINT N'Migration 0056 (import des taux par API) terminée.';
GO
