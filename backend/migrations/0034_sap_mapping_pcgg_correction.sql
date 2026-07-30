/* ============================================================================
   Correction du mapping comptable SAP avec les VRAIS comptes du plan PCGG
   (plan opérationnel de la société 2251). Les valeurs précédentes pointaient
   sur de mauvais comptes (ex. CAISSE = 51400000 « Chèques à l'encaissement »
   au lieu de 57101000 « Caisse siège social en FCFA ») et laissaient les
   comptes de change / créance personnel vides.
   Base : npg_gestion_caisse (SQL Server) — idempotent.
   ============================================================================ */
SET NOCOUNT ON;

UPDATE dbo.sap_compte_mapping SET compte_sap = '57101000', updated_at = SYSUTCDATETIME() WHERE type_compte = 'CAISSE';          -- Caisse siège social en FCFA
UPDATE dbo.sap_compte_mapping SET compte_sap = '77610000', updated_at = SYSUTCDATETIME() WHERE type_compte = 'GAIN_CHANGE';     -- Gains de change
UPDATE dbo.sap_compte_mapping SET compte_sap = '67610000', updated_at = SYSUTCDATETIME() WHERE type_compte = 'PERTE_CHANGE';    -- Perte de change
UPDATE dbo.sap_compte_mapping SET compte_sap = '42110000', updated_at = SYSUTCDATETIME() WHERE type_compte = 'CREDIT_EMPLOYE';  -- Personnel, avances

PRINT N'Migration 0034 (correction mapping PCGG) terminée.';
GO
