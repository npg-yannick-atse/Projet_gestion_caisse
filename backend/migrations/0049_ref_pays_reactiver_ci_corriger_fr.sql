/* ============================================================================
   Correctif référentiel : réactiver la Côte d'Ivoire et corriger la France
   Base : npg_gestion_caisse (SQL Server) — idempotent.

   CONSTAT (vérifié en base le 05/08/2026)
   ---------------------------------------
   `ref_pays` contient 2 lignes issues du seed initial, toutes deux en
   soft-delete, qui empêchent la sélection des deux pays les plus fréquents :

     id=1  code=CI  libellé="Côte D'Ivoire"   est_actif=0  deleted_at=25/06/2026
     id=4  code=FR  libellé="COTE D'IVOIRE"   est_actif=0  deleted_at=08/07/2026

   La ligne id=4 est une erreur de saisie : le code FR porte le libellé de la
   Côte d'Ivoire.

   POURQUOI L'IMPORT ISO NE LES A PAS RECRÉÉES
   -------------------------------------------
   `UQ_ref_pays_code UNIQUE (code)` n'est PAS filtrée sur `deleted_at` : les
   codes CI et FR restent occupés par les lignes supprimées, donc l'import
   massif des pays ISO (ids 6+) n'a pas pu les insérer. Réactiver les lignes
   existantes est la seule voie — un INSERT échouerait sur la contrainte.

   IMPACT
   ------
   CI est de très loin le premier pays du référentiel partenaires
   (2236 partenaires), FR le troisième (139). Sans ce correctif, aucun bon
   exigeant le nom du client ne peut être créé pour un client ivoirien.
   ============================================================================ */
SET NOCOUNT ON;

/* --- Côte d'Ivoire : réactivation (libellé normalisé au passage) ---------- */
UPDATE dbo.ref_pays
SET libelle       = N'Côte d''Ivoire',
    est_actif     = 1,
    deleted_at    = NULL,
    deleted_by_id = NULL,
    updated_at    = SYSUTCDATETIME(),
    version       = version + 1
WHERE code = N'CI'
  AND (deleted_at IS NOT NULL OR est_actif = 0 OR libelle <> N'Côte d''Ivoire');
GO

/* --- France : correction du libellé erroné + réactivation ----------------- */
UPDATE dbo.ref_pays
SET libelle       = N'France',
    est_actif     = 1,
    deleted_at    = NULL,
    deleted_by_id = NULL,
    updated_at    = SYSUTCDATETIME(),
    version       = version + 1
WHERE code = N'FR'
  AND (deleted_at IS NOT NULL OR est_actif = 0 OR libelle <> N'France');
GO

/* --- Contrôle : les deux pays doivent être actifs et correctement nommés -- */
IF EXISTS (
    SELECT 1 FROM dbo.ref_pays
    WHERE code IN (N'CI', N'FR')
      AND (deleted_at IS NOT NULL OR est_actif = 0)
)
    THROW 50049, N'0049 : CI ou FR est toujours inactif après correction.', 1;
GO

PRINT N'Migration 0049 (réactivation CI / correction FR) terminée.';
GO
