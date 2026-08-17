/* ============================================================================
   Un reçu pour chaque entrée d'argent en caisse.
   Base : npg_gestion_caisse (SQL Server) — idempotent.

   Toute sortie d'argent laissait une pièce : le bon, imprimé et signé. Les
   ENTRÉES, elles, n'en laissaient aucune. Un client règle, un porteur rapporte
   ce qu'il n'a pas dépensé, le budget mensuel reprend son reliquat — l'argent
   entrait dans le tiroir sans qu'aucun document n'atteste de sa remise. Celui
   qui apporte n'avait rien à garder, et le caissier rien à opposer.

   LE REÇU SUIT L'ÉCRITURE, PAS L'INTENTION. Il est émis là où une caisse est
   CRÉDITÉE en partie double — un point de passage unique par lequel passent les
   quatorze chemins qui écrivent le grand livre. Aucun ne peut donc créditer une
   caisse sans laisser de reçu, y compris ceux qu'on ajoutera demain.

   Le numéro est séquentiel et unique. Il ne se réutilise pas : un reçu annulé
   garderait son numéro, sans quoi deux papiers différents porteraient la même
   référence.
   ============================================================================ */
SET NOCOUNT ON;

IF OBJECT_ID('dbo.trx_recu_caisse', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.trx_recu_caisse (
    id               BIGINT IDENTITY(1,1) NOT NULL,
    numero           NVARCHAR(20) NOT NULL,
    caisse_id        BIGINT NOT NULL,
    devise_id        BIGINT NOT NULL,
    montant          DECIMAL(19,4) NOT NULL,
    /* Ce qui a fait entrer l'argent : REMBOURSEMENT_BON, ENCAISSEMENT,
       AJUSTEMENT… Repris du type d'opération, pour que le reçu se lise seul. */
    type_entree      NVARCHAR(40) NULL,
    /* Relie le reçu aux deux écritures qui l'ont provoqué. */
    transaction_uuid UNIQUEIDENTIFIER NOT NULL,
    /* Qui a remis l'argent — saisi quand on le connaît, jamais deviné. */
    remis_par        NVARCHAR(255) NULL,
    motif            NVARCHAR(500) NULL,
    created_at       DATETIME2(3) NOT NULL CONSTRAINT DF_trx_recu_created DEFAULT SYSUTCDATETIME(),
    created_by_id    BIGINT NULL,
    CONSTRAINT PK_trx_recu_caisse PRIMARY KEY (id),
    CONSTRAINT UQ_trx_recu_numero UNIQUE (numero),
    CONSTRAINT FK_trx_recu_caisse_caisse FOREIGN KEY (caisse_id) REFERENCES dbo.fin_caisse(id),
    CONSTRAINT FK_trx_recu_caisse_devise FOREIGN KEY (devise_id) REFERENCES dbo.fin_devise(id),
    /* Un reçu de zéro n'atteste de rien. */
    CONSTRAINT CK_trx_recu_montant CHECK (montant > 0)
  );
  PRINT 'Table dbo.trx_recu_caisse créée.';
END
ELSE
  PRINT 'Table dbo.trx_recu_caisse déjà présente.';
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_trx_recu_caisse_caisse')
BEGIN
  CREATE INDEX IX_trx_recu_caisse_caisse ON dbo.trx_recu_caisse(caisse_id, created_at DESC);
  PRINT 'IX_trx_recu_caisse_caisse créé.';
END
GO

/* Retrouver le reçu depuis l'opération qui l'a produit, et l'inverse. */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_trx_recu_caisse_tx')
BEGIN
  CREATE INDEX IX_trx_recu_caisse_tx ON dbo.trx_recu_caisse(transaction_uuid);
  PRINT 'IX_trx_recu_caisse_tx créé.';
END
GO
