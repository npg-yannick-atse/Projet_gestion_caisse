/* ============================================================================
   Encaissement : faire ENTRER de l'argent dans une caisse (miroir du décaissement)
   Base : npg_gestion_caisse (SQL Server) — idempotent.

   1) Nouveau type de compte RECETTE = contrepartie d'un encaissement (l'argent
      qui entre dans la caisse vient d'une recette : client, dotation, banque…).
      L'écriture d'un encaissement est : CRÉDIT caisse (la caisse monte) /
      DÉBIT recette. On élargit donc la contrainte CK_trx_ec_type.

   2) Colonnes client/motif sur trx_operation, renseignées pour les opérations
      de type ENCAISSEMENT (nullable, sans impact sur les autres opérations).
      Le type_operation est un nvarchar(20) sans contrainte CHECK : la nouvelle
      valeur ENCAISSEMENT ne nécessite aucune modification de schéma.
   ============================================================================ */
SET NOCOUNT ON;

/* 1) Type de compte RECETTE ------------------------------------------------- */
IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_trx_ec_type' AND parent_object_id = OBJECT_ID(N'dbo.trx_ecriture_comptable')
)
    ALTER TABLE dbo.trx_ecriture_comptable DROP CONSTRAINT CK_trx_ec_type;

ALTER TABLE dbo.trx_ecriture_comptable ADD CONSTRAINT CK_trx_ec_type
    CHECK (type_compte IN (N'CAISSE', N'PORTEFEUILLE', N'GAIN_CHANGE', N'PERTE_CHANGE', N'CHARGE', N'RECETTE'));
PRINT N'Contrainte CK_trx_ec_type élargie au type RECETTE.';

/* 2) Colonnes client / motif sur les opérations ---------------------------- */
IF COL_LENGTH('dbo.trx_operation', 'client_nom') IS NULL
    ALTER TABLE dbo.trx_operation ADD client_nom NVARCHAR(200) NULL;

IF COL_LENGTH('dbo.trx_operation', 'client_numero') IS NULL
    ALTER TABLE dbo.trx_operation ADD client_numero NVARCHAR(50) NULL;

IF COL_LENGTH('dbo.trx_operation', 'motif') IS NULL
    ALTER TABLE dbo.trx_operation ADD motif NVARCHAR(200) NULL;

PRINT N'Migration 0019 (encaissement) terminée.';
GO
