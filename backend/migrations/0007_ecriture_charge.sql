/* Décaissement en partie double : ajoute le type de compte CHARGE (contrepartie des
   décaissements, imputée au centre de coût). Cf. Dossier Partie IV §1.1 « partie double ».
   Idempotent. */

IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_trx_ec_type' AND parent_object_id = OBJECT_ID(N'dbo.trx_ecriture_comptable')
)
    ALTER TABLE dbo.trx_ecriture_comptable DROP CONSTRAINT CK_trx_ec_type;

ALTER TABLE dbo.trx_ecriture_comptable ADD CONSTRAINT CK_trx_ec_type
    CHECK (type_compte IN (N'CAISSE', N'PORTEFEUILLE', N'GAIN_CHANGE', N'PERTE_CHANGE', N'CHARGE'));
