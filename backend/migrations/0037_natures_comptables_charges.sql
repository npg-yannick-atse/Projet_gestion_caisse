/* ============================================================================
   Génère une NATURE COMPTABLE par compte de CHARGE (classe 6) du plan PCGG.
   Chaque nature = un compte (code = n° de compte, libellé = libellé du compte),
   rattachée à son compte (ref_nature_comptable). Ne recrée pas ce qui existe déjà
   (par code) ni les comptes déjà rattachés à une nature. Idempotent.
   Dépend de 0035 (comptes PCGG chargés).
   Base : npg_gestion_caisse (SQL Server).
   ============================================================================ */
SET NOCOUNT ON;

INSERT INTO dbo.ref_nature_operation(code, libelle, nature_comptable_id, est_actif, created_at, version)
SELECT nc.code_comptable_sap, nc.libelle, nc.id, 1, SYSUTCDATETIME(), 1
FROM dbo.ref_nature_comptable nc
WHERE nc.code_comptable_sap LIKE '6%'
  AND NOT EXISTS (SELECT 1 FROM dbo.ref_nature_operation n1 WHERE n1.code = nc.code_comptable_sap)
  AND NOT EXISTS (SELECT 1 FROM dbo.ref_nature_operation n2 WHERE n2.nature_comptable_id = nc.id);

PRINT N'Migration 0037 (natures comptables = charges classe 6) terminée.';
GO
