/* ============================================================================
   Centre de coût : le budget devient MENSUEL (remplace le budget annuel).
   Renomme ref_cost_center.budget_annuel → budget_mensuel.
   Base : npg_gestion_caisse (SQL Server) — idempotent.

   NB : les valeurs existantes (saisies comme budgets annuels) sont conservées
   telles quelles et réinterprétées comme des budgets mensuels — à réajuster
   côté données si nécessaire.
   ============================================================================ */
SET NOCOUNT ON;

IF COL_LENGTH('dbo.ref_cost_center', 'budget_annuel') IS NOT NULL
   AND COL_LENGTH('dbo.ref_cost_center', 'budget_mensuel') IS NULL
BEGIN
    EXEC sp_rename 'dbo.ref_cost_center.budget_annuel', 'budget_mensuel', 'COLUMN';
    PRINT N'Colonne ref_cost_center.budget_annuel renommée en budget_mensuel.';
END
ELSE
    PRINT N'Rien à faire (colonne déjà renommée ou absente).';
GO
