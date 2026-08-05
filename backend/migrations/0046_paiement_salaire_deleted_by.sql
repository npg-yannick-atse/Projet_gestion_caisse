/* ============================================================================
   Correctif : colonne d'audit manquante sur fin_paiement_salaire
   Base : npg_gestion_caisse (SQL Server) — idempotent.

   La table créée en 0045 omettait `deleted_by_id`, pourtant déclarée par
   AuditableEntity dont hérite l'entité. TypeORM générait donc un SELECT
   référençant une colonne inexistante → « Invalid column name 'deleted_by_id' »
   sur toute lecture de la table.

   Détecté par le test de bout en bout (la grille des salaires renvoyait une
   erreur SQL) — un typecheck ne peut pas voir ce genre d'écart, puisqu'il porte
   sur le code et non sur le schéma réel.
   ============================================================================ */
SET NOCOUNT ON;

IF COL_LENGTH('dbo.fin_paiement_salaire', 'deleted_by_id') IS NULL
    ALTER TABLE dbo.fin_paiement_salaire ADD deleted_by_id BIGINT NULL;
GO

PRINT N'Migration 0046 (colonne deleted_by_id) terminée.';
GO
