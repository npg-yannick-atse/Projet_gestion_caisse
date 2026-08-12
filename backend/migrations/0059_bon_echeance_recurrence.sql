/*
  Échéance des bons récurrents.

  `est_recurrent` existait depuis l'origine, mais ne servait à rien : aucune
  date, aucun rappel. Un bon coché « récurrent » se comportait exactement comme
  les autres — au 12/08/2026 la base n'en comptait d'ailleurs aucun, et pas une
  seule fréquence renseignée.

  On ajoute la date à laquelle le bon doit être rappelé. Un job quotidien
  notifiera le demandeur ce jour-là, puis reportera la date d'une période.

  La contrainte est posée sans NOCHECK : aucun bon récurrent n'existe, il n'y a
  donc rien à laisser passer. Un bon récurrent sans échéance serait un bon qui
  ne se rappelle jamais — autant ne pas le cocher.
*/

IF COL_LENGTH('dbo.trx_bon', 'date_prochaine_echeance') IS NULL
BEGIN
  ALTER TABLE dbo.trx_bon ADD date_prochaine_echeance DATE NULL;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_trx_bon_echeance_si_recurrent')
BEGIN
  ALTER TABLE dbo.trx_bon
    ADD CONSTRAINT CK_trx_bon_echeance_si_recurrent
    CHECK (est_recurrent = 0 OR (date_prochaine_echeance IS NOT NULL AND frequence_recurrence IS NOT NULL));
END
GO

/*
  Le job balaie chaque jour « les bons récurrents dont l'échéance est atteinte ».
  Sans index, c'est une lecture complète de la table à chaque passage.
  L'index est FILTRÉ sur les seuls bons récurrents : ils resteront une minorité.
*/
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_trx_bon_echeance' AND object_id = OBJECT_ID('dbo.trx_bon'))
BEGIN
  CREATE NONCLUSTERED INDEX IX_trx_bon_echeance
    ON dbo.trx_bon (date_prochaine_echeance)
    INCLUDE (demandeur_id, numero, montant_total, frequence_recurrence)
    WHERE est_recurrent = 1 AND deleted_at IS NULL;
END
GO
