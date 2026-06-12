/* Circuit d'approbation des demandes d'extension de budget.
   - statut_extension : NON / EN_ATTENTE / APPROUVEE / REFUSEE
   - extension_mode   : DECOUVERT (autorise le depassement) | RECHARGE (recharge le portefeuille)
   - tracabilite de la decision + permission d'approbation.
   Idempotent. */
IF COL_LENGTH('dbo.trx_bon', 'statut_extension') IS NULL
    ALTER TABLE dbo.trx_bon ADD statut_extension NVARCHAR(20) NOT NULL CONSTRAINT DF_trx_bon_statut_ext DEFAULT 'NON';

IF COL_LENGTH('dbo.trx_bon', 'extension_mode') IS NULL
    ALTER TABLE dbo.trx_bon ADD extension_mode NVARCHAR(20) NULL;

IF COL_LENGTH('dbo.trx_bon', 'extension_decide_par_id') IS NULL
    ALTER TABLE dbo.trx_bon ADD extension_decide_par_id BIGINT NULL;

IF COL_LENGTH('dbo.trx_bon', 'extension_date_decision') IS NULL
    ALTER TABLE dbo.trx_bon ADD extension_date_decision DATETIME2(3) NULL;

IF COL_LENGTH('dbo.trx_bon', 'extension_commentaire') IS NULL
    ALTER TABLE dbo.trx_bon ADD extension_commentaire NVARCHAR(500) NULL;
GO

/* Backfill : les bons deja crees avec une demande d'extension passent EN_ATTENTE. */
UPDATE dbo.trx_bon
   SET statut_extension = 'EN_ATTENTE'
 WHERE demande_extension = 1 AND statut_extension = 'NON';

/* Permission d'approbation (assignable a un role / profil via l'admin ; les admins l'ont d'office). */
IF NOT EXISTS (SELECT 1 FROM dbo.sec_permission WHERE code = N'EXTENSION_APPROUVER')
    INSERT INTO dbo.sec_permission(code, libelle, module)
    VALUES (N'EXTENSION_APPROUVER', N'Approuver ou refuser une demande d''extension de budget', N'BON');
GO
