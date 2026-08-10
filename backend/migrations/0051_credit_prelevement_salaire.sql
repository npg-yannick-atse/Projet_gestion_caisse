/* ============================================================================
   Prélèvement des mensualités de crédit sur le salaire
   Base : npg_gestion_caisse (SQL Server) — idempotent.

   DÉCISION MÉTIER (05/08/2026)
   ----------------------------
   L'autorisation de prélever est donnée UNE SEULE FOIS, au moment où le DAF
   approuve le crédit. Ensuite, chaque paiement de salaire retient
   automatiquement la mensualité due, et l'approbateur reçoit une notification
   d'information.

   Le choix d'une autorisation unique plutôt que d'une validation mensuelle
   évite de bloquer la paie chaque mois sur une approbation ; en contrepartie,
   la trace de QUI a autorisé et QUAND doit être conservée — d'où les deux
   colonnes d'audit ci-dessous.

   Un crédit déjà approuvé avant cette migration reste à 0 : on n'accorde pas
   rétroactivement un prélèvement que personne n'a autorisé.
   ============================================================================ */
SET NOCOUNT ON;

IF COL_LENGTH('dbo.fin_credit', 'prelevement_salaire') IS NULL
    ALTER TABLE dbo.fin_credit
        ADD prelevement_salaire BIT NOT NULL
            CONSTRAINT DF_fin_credit_prelevement DEFAULT 0;
GO

/* Qui a autorisé le prélèvement, et quand. Renseigné à l'approbation. */
IF COL_LENGTH('dbo.fin_credit', 'prelevement_autorise_par_id') IS NULL
    ALTER TABLE dbo.fin_credit ADD prelevement_autorise_par_id BIGINT NULL;
GO

IF COL_LENGTH('dbo.fin_credit', 'prelevement_autorise_le') IS NULL
    ALTER TABLE dbo.fin_credit ADD prelevement_autorise_le DATETIME2 NULL;
GO

/* Rattachement d'un remboursement au paiement de salaire qui l'a produit.
   Sans ce lien, une mensualité retenue serait indistinguable d'un versement
   encaissé au guichet — or l'annulation d'un paiement de salaire doit pouvoir
   retrouver, et contre-passer, la retenue correspondante. */
IF COL_LENGTH('dbo.fin_credit_remboursement', 'paiement_salaire_id') IS NULL
    ALTER TABLE dbo.fin_credit_remboursement ADD paiement_salaire_id BIGINT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_fcr_paiement_salaire')
    ALTER TABLE dbo.fin_credit_remboursement
        ADD CONSTRAINT FK_fcr_paiement_salaire
            FOREIGN KEY (paiement_salaire_id) REFERENCES dbo.fin_paiement_salaire(id);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_fcr_paiement_salaire')
    CREATE INDEX IX_fcr_paiement_salaire
        ON dbo.fin_credit_remboursement (paiement_salaire_id)
        WHERE paiement_salaire_id IS NOT NULL;
GO

PRINT N'Migration 0050 (prélèvement des mensualités sur salaire) terminée.';
GO
