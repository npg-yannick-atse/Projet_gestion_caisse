/* ============================================================================
   Corrige CK_trx_op_type : ajoute les types d'opération ENCAISSEMENT et CREDIT.
   Base : npg_gestion_caisse (SQL Server) — idempotent.

   Le schéma initial (db_init_gestion_caisse.sql) limitait type_operation à
   (RECHARGE, DECAISSEMENT, TRANSFERT, AJUSTEMENT). Les fonctionnalités
   Encaissement (migration 0019) et Crédit employé (migration 0021) émettent
   des opérations de type ENCAISSEMENT et CREDIT, rejetées par cette contrainte
   CHECK (« INSERT ... conflicted with the CHECK constraint CK_trx_op_type »).
   On élargit donc la contrainte. Le nouvel ensemble est un sur-ensemble de
   l'ancien : aucune ligne existante n'est invalidée.
   ============================================================================ */
SET NOCOUNT ON;

IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_trx_op_type' AND parent_object_id = OBJECT_ID(N'dbo.trx_operation')
)
    ALTER TABLE dbo.trx_operation DROP CONSTRAINT CK_trx_op_type;

ALTER TABLE dbo.trx_operation ADD CONSTRAINT CK_trx_op_type
    CHECK (type_operation IN
        (N'RECHARGE', N'DECAISSEMENT', N'TRANSFERT', N'AJUSTEMENT', N'ENCAISSEMENT', N'CREDIT'));
PRINT N'Contrainte CK_trx_op_type élargie aux types ENCAISSEMENT et CREDIT.';
GO
