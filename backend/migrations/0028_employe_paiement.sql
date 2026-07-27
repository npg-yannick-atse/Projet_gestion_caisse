-- 0028_employe_paiement.sql
-- Enrichit la fiche employé avec les informations de PAIEMENT :
--   - mode_reglement : comment l'employé est payé (ESPECES / VIREMENT) ;
--   - banque / rib : coordonnées bancaires (utiles en mode VIREMENT) ;
--   - portefeuille_source_id : portefeuille source par défaut d'où sortent
--     ses avances / crédits / bénéfices (référence souple vers fin_portefeuille,
--     comme direction_id — pas de contrainte FK dure).

IF COL_LENGTH('dbo.ref_employe', 'mode_reglement') IS NULL
  ALTER TABLE dbo.ref_employe ADD mode_reglement NVARCHAR(20) NOT NULL
    CONSTRAINT DF_ref_employe_mode_reglement DEFAULT 'ESPECES';
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_ref_employe_mode_reglement')
  ALTER TABLE dbo.ref_employe ADD CONSTRAINT CK_ref_employe_mode_reglement
    CHECK (mode_reglement IN ('ESPECES', 'VIREMENT'));
GO
IF COL_LENGTH('dbo.ref_employe', 'banque') IS NULL
  ALTER TABLE dbo.ref_employe ADD banque NVARCHAR(150) NULL;
GO
IF COL_LENGTH('dbo.ref_employe', 'rib') IS NULL
  ALTER TABLE dbo.ref_employe ADD rib NVARCHAR(50) NULL;
GO
IF COL_LENGTH('dbo.ref_employe', 'portefeuille_source_id') IS NULL
  ALTER TABLE dbo.ref_employe ADD portefeuille_source_id BIGINT NULL;
GO
