/* ============================================================================
   Replanification d'un crédit après une retenue partielle : deux modes
   Base : npg_gestion_caisse (SQL Server) — idempotent.

   DÉCISION MÉTIER (06/08/2026)
   ----------------------------
   Quand une mensualité n'a pu être prélevée qu'en partie, le reliquat peut être
   traité de DEUX façons, au choix du DAF lorsqu'il autorise le prélèvement :

     REPARTIR  le reliquat est réparti sur les échéances restantes.
               La mensualité monte, la date de fin ne bouge pas.

     ALLONGER  la mensualité convenue est maintenue et des mois sont ajoutés
               jusqu'à extinction de la dette. La date de fin recule.

   ALLONGER est le mode par défaut : le déclencheur d'une retenue partielle est
   précisément que l'employé n'a PAS pu payer. Lui réclamer davantage les mois
   suivants irait dans le mauvais sens, alors que maintenir la mensualité
   convenue préserve la charge qu'il avait acceptée.

   `mensualite_reference` fige le montant convenu. Sans lui, le mode ALLONGER
   n'aurait plus de référence dès que `nb_mois` évolue : la mensualité serait
   recalculée sur la nouvelle durée et le crédit ne se solderait jamais.
   ============================================================================ */
SET NOCOUNT ON;

IF COL_LENGTH('dbo.fin_credit', 'mode_replanification') IS NULL
    ALTER TABLE dbo.fin_credit
        ADD mode_replanification NVARCHAR(20) NOT NULL
            CONSTRAINT DF_fin_credit_mode_replan DEFAULT N'ALLONGER';
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_fin_credit_mode_replan')
    ALTER TABLE dbo.fin_credit
        ADD CONSTRAINT CK_fin_credit_mode_replan
            CHECK (mode_replanification IN (N'REPARTIR', N'ALLONGER'));
GO

/* Mensualité convenue, figée. NULL pour les crédits antérieurs : elle est
   calculée à la volée au premier besoin (montant / nb_mois). */
IF COL_LENGTH('dbo.fin_credit', 'mensualite_reference') IS NULL
    ALTER TABLE dbo.fin_credit ADD mensualite_reference DECIMAL(19,4) NULL;
GO

/* Durée d'origine, conservée pour pouvoir dire de combien le crédit a été
   allongé. `nb_mois` porte, lui, la durée COURANTE. */
IF COL_LENGTH('dbo.fin_credit', 'nb_mois_initial') IS NULL
    ALTER TABLE dbo.fin_credit ADD nb_mois_initial INT NULL;
GO

/* Renseigne les deux colonnes pour l'existant. Aucun de ces crédits n'est
   prélevé sur salaire (prelevement_salaire = 0), la valeur ne change donc
   aucun comportement — elle rend seulement l'affichage cohérent. */
UPDATE dbo.fin_credit
   SET nb_mois_initial = COALESCE(nb_mois_initial, nb_mois),
       mensualite_reference = COALESCE(
           mensualite_reference,
           CASE WHEN nb_mois > 0 THEN ROUND(montant / nb_mois, 4) ELSE 0 END)
 WHERE nb_mois_initial IS NULL OR mensualite_reference IS NULL;
GO

PRINT N'Migration 0052 (mode de replanification des crédits) terminée.';
GO
