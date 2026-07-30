/* ============================================================================
   Ajoute le N° FOURNISSEUR SAP (LIFNR) sur les partenaires, symétrique du
   numero_client (KUNNR). Permet de vérifier/relier un partenaire fournisseur
   au fournisseur SAP (BAPI_VENDOR_GETDETAIL). Idempotent.
   Base : npg_gestion_caisse (SQL Server).
   ============================================================================ */
SET NOCOUNT ON;

IF COL_LENGTH('dbo.ref_partenaire', 'numero_fournisseur') IS NULL
  ALTER TABLE dbo.ref_partenaire ADD numero_fournisseur NVARCHAR(50) NULL;
GO

PRINT N'Migration 0038 (partenaire numero_fournisseur) terminée.';
GO
