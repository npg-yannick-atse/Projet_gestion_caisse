-- 0029_operation_sap.sql
-- Idempotence de l'envoi des opérations vers SAP : on trace, sur chaque opération,
-- le numéro de pièce SAP obtenu (BELNR+société+exercice), le statut et la date.
-- Évite les doubles postings et permet d'afficher l'état « envoyé » dans l'appli.

IF COL_LENGTH('dbo.trx_operation', 'sap_piece') IS NULL
  ALTER TABLE dbo.trx_operation ADD sap_piece NVARCHAR(20) NULL;
GO
IF COL_LENGTH('dbo.trx_operation', 'sap_statut') IS NULL
  ALTER TABLE dbo.trx_operation ADD sap_statut NVARCHAR(20) NULL; -- NULL / ENVOYE / ERREUR
GO
IF COL_LENGTH('dbo.trx_operation', 'sap_date') IS NULL
  ALTER TABLE dbo.trx_operation ADD sap_date DATETIME2(3) NULL;
GO
IF COL_LENGTH('dbo.trx_operation', 'sap_message') IS NULL
  ALTER TABLE dbo.trx_operation ADD sap_message NVARCHAR(500) NULL;
GO
