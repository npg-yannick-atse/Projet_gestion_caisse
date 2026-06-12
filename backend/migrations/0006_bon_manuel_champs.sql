/* Ajoute au bon manuel les mêmes informations qu'un bon normal.
   Idempotent — s'exécute même si 0005 a déjà été appliqué (nouveau fichier). */

IF OBJECT_ID(N'dbo.trx_bon_manuel', N'U') IS NOT NULL
BEGIN
    IF COL_LENGTH('dbo.trx_bon_manuel', 'type_bon_id') IS NULL
        ALTER TABLE dbo.trx_bon_manuel ADD type_bon_id BIGINT NULL;
    IF COL_LENGTH('dbo.trx_bon_manuel', 'libelle') IS NULL
        ALTER TABLE dbo.trx_bon_manuel ADD libelle NVARCHAR(255) NULL;
    IF COL_LENGTH('dbo.trx_bon_manuel', 'partenaire_id') IS NULL
        ALTER TABLE dbo.trx_bon_manuel ADD partenaire_id BIGINT NULL;
    IF COL_LENGTH('dbo.trx_bon_manuel', 'numero_bl') IS NULL
        ALTER TABLE dbo.trx_bon_manuel ADD numero_bl NVARCHAR(100) NULL;
    IF COL_LENGTH('dbo.trx_bon_manuel', 'code_manutention') IS NULL
        ALTER TABLE dbo.trx_bon_manuel ADD code_manutention NVARCHAR(100) NULL;
    IF COL_LENGTH('dbo.trx_bon_manuel', 'cost_center_id') IS NULL
        ALTER TABLE dbo.trx_bon_manuel ADD cost_center_id BIGINT NULL;
    IF COL_LENGTH('dbo.trx_bon_manuel', 'numero_client') IS NULL
        ALTER TABLE dbo.trx_bon_manuel ADD numero_client NVARCHAR(50) NULL;
    IF COL_LENGTH('dbo.trx_bon_manuel', 'description') IS NULL
        ALTER TABLE dbo.trx_bon_manuel ADD description NVARCHAR(500) NULL;
END
