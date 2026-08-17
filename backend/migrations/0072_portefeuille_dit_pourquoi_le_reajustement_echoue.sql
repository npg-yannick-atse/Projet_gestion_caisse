/* ============================================================================
   Le portefeuille garde la raison du dernier réajustement manqué.
   Base : npg_gestion_caisse (SQL Server) — idempotent.

   Le réajustement mensuel crédite un portefeuille jusqu'à son plafond, en
   débitant sa caisse source. Quand la caisse est vide, il refuse — à juste
   titre : l'argent vient d'une caisse, il ne se crée pas.

   Mais il refusait SANS RIEN DIRE. L'échec partait dans un avertissement de
   journal côté serveur, et l'écran affichait un portefeuille à 0 en face d'un
   budget d'un milliard, sans un mot. On redémarrait le backend en croyant
   débloquer la situation, et il ne se passait rien de visible.

   Ces deux colonnes portent la dernière tentative manquée. Elles sont effacées
   dès qu'un réajustement réussit : ce qu'elles contiennent est toujours la
   raison ACTUELLE, jamais un vieux message resté là.
   ============================================================================ */
SET NOCOUNT ON;

IF COL_LENGTH('dbo.fin_portefeuille', 'budget_reset_erreur') IS NULL
BEGIN
  ALTER TABLE dbo.fin_portefeuille ADD budget_reset_erreur NVARCHAR(500) NULL;
  PRINT 'fin_portefeuille.budget_reset_erreur ajoutée.';
END
ELSE
  PRINT 'fin_portefeuille.budget_reset_erreur déjà présente.';
GO

IF COL_LENGTH('dbo.fin_portefeuille', 'budget_reset_tente_le') IS NULL
BEGIN
  ALTER TABLE dbo.fin_portefeuille ADD budget_reset_tente_le DATETIME2(3) NULL;
  PRINT 'fin_portefeuille.budget_reset_tente_le ajoutée.';
END
ELSE
  PRINT 'fin_portefeuille.budget_reset_tente_le déjà présente.';
GO
