/* ============================================================================
   Période de validité d'un profil attribué à un utilisateur.
   Base : npg_gestion_caisse (SQL Server) — idempotent.

   Un profil était attribué DÉFINITIVEMENT : la seule trace était
   `date_attribution`, qui dit quand on l'a donné, jamais jusqu'à quand. Un
   profil accordé le temps d'un remplacement, d'un inventaire ou d'une clôture
   devait donc être retiré à la main — et restait actif si on l'oubliait.

   On reprend le modèle déjà en place sur sec_user_permission_extra :
     date_debut NULL = effectif immédiatement
     date_fin   NULL = sans terme (comportement actuel, donc rétrocompatible)

   La résolution des permissions filtre sur ces bornes. Aucune ligne existante
   n'est modifiée : toutes gardent deux bornes nulles, donc restent permanentes.
   ============================================================================ */
SET NOCOUNT ON;

IF COL_LENGTH('dbo.sec_user_profil', 'date_debut') IS NULL
    ALTER TABLE dbo.sec_user_profil ADD date_debut DATETIME2(3) NULL;
GO

IF COL_LENGTH('dbo.sec_user_profil', 'date_fin') IS NULL
    ALTER TABLE dbo.sec_user_profil ADD date_fin DATETIME2(3) NULL;
GO

/* La résolution des droits lit ces colonnes à chaque appel : un index les rend
   utiles plutôt que coûteuses. */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_sec_user_profil_validite')
    CREATE INDEX IX_sec_user_profil_validite
        ON dbo.sec_user_profil (user_id, date_debut, date_fin);
GO

PRINT N'sec_user_profil : période de validité ajoutée (bornes nulles = permanent).';
GO
