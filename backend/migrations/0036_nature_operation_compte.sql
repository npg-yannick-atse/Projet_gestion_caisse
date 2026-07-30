/* ============================================================================
   Fusion « Nature d'opération = Nature comptable » : chaque nature d'opération
   porte désormais son COMPTE COMPTABLE PCGG (référentiel ref_nature_comptable).
   Ajout d'une colonne de rattachement + clé étrangère. Idempotent.
   Base : npg_gestion_caisse (SQL Server).
   ============================================================================ */
SET NOCOUNT ON;

IF COL_LENGTH('dbo.ref_nature_operation', 'nature_comptable_id') IS NULL
  ALTER TABLE dbo.ref_nature_operation ADD nature_comptable_id BIGINT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_nature_operation_nature_comptable')
  ALTER TABLE dbo.ref_nature_operation
    ADD CONSTRAINT FK_nature_operation_nature_comptable
    FOREIGN KEY (nature_comptable_id) REFERENCES dbo.ref_nature_comptable(id);
GO

PRINT N'Migration 0036 (nature d''opération -> compte comptable) terminée.';
GO
