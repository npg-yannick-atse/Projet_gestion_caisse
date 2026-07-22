/* ============================================================================
   Crédit employé (prêt remboursable) avec décaissement réel
   Base : npg_gestion_caisse (SQL Server) — idempotent.

   Un validateur accorde un crédit à un employé de sa direction : l'argent SORT
   réellement d'une caisse OU d'un portefeuille (écriture en partie double
   DÉBIT source / CRÉDIT créance employé). Un seul crédit EN_COURS par employé.

   1) Type de compte CREDIT_EMPLOYE = contrepartie (créance sur l'employé).
   2) Table fin_credit + index unique filtré (1 crédit EN_COURS par employé).
   3) Permission CREDIT_GERER (validateurs + admins).
   ============================================================================ */
SET NOCOUNT ON;

/* 1) Type de compte CREDIT_EMPLOYE ------------------------------------------ */
IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_trx_ec_type' AND parent_object_id = OBJECT_ID(N'dbo.trx_ecriture_comptable')
)
    ALTER TABLE dbo.trx_ecriture_comptable DROP CONSTRAINT CK_trx_ec_type;

ALTER TABLE dbo.trx_ecriture_comptable ADD CONSTRAINT CK_trx_ec_type
    CHECK (type_compte IN (N'CAISSE', N'PORTEFEUILLE', N'GAIN_CHANGE', N'PERTE_CHANGE',
                           N'CHARGE', N'RECETTE', N'CREDIT_EMPLOYE'));
PRINT N'Contrainte CK_trx_ec_type élargie au type CREDIT_EMPLOYE.';

/* 2) Table fin_credit ------------------------------------------------------- */
IF OBJECT_ID(N'dbo.fin_credit', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.fin_credit (
        id               BIGINT IDENTITY(1,1) NOT NULL,
        employe_id       BIGINT NOT NULL,
        montant          DECIMAL(19,4) NOT NULL,
        nb_mois          INT NOT NULL,
        source_type      NVARCHAR(20) NOT NULL,   -- CAISSE | PORTEFEUILLE
        source_id        BIGINT NOT NULL,
        devise_id        BIGINT NOT NULL,
        statut           NVARCHAR(20) NOT NULL CONSTRAINT DF_fin_credit_statut DEFAULT (N'EN_COURS'),
        date_debut       DATE NOT NULL CONSTRAINT DF_fin_credit_debut DEFAULT (CAST(SYSUTCDATETIME() AS DATE)),
        transaction_uuid UNIQUEIDENTIFIER NULL,
        commentaire      NVARCHAR(MAX) NULL,
        created_at       DATETIME2(3) NOT NULL CONSTRAINT DF_fin_credit_created DEFAULT SYSUTCDATETIME(),
        created_by_id    BIGINT NULL,
        updated_at       DATETIME2(3) NULL,
        updated_by_id    BIGINT NULL,
        deleted_at       DATETIME2(3) NULL,
        deleted_by_id    BIGINT NULL,
        version          INT NOT NULL CONSTRAINT DF_fin_credit_version DEFAULT (1),
        CONSTRAINT PK_fin_credit PRIMARY KEY CLUSTERED (id),
        CONSTRAINT CK_fin_credit_montant CHECK (montant > 0),
        CONSTRAINT CK_fin_credit_mois CHECK (nb_mois >= 1),
        CONSTRAINT CK_fin_credit_source CHECK (source_type IN (N'CAISSE', N'PORTEFEUILLE')),
        CONSTRAINT CK_fin_credit_statut CHECK (statut IN (N'EN_COURS', N'SOLDE')),
        CONSTRAINT FK_fin_credit_employe FOREIGN KEY (employe_id) REFERENCES dbo.ref_employe(id)
    );
    CREATE INDEX IX_fin_credit_employe ON dbo.fin_credit(employe_id);
    PRINT N'Table fin_credit créée.';
END

/* Un seul crédit EN_COURS par employé (les crédits SOLDÉ ne comptent pas). */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ_fin_credit_encours'
               AND object_id = OBJECT_ID(N'dbo.fin_credit'))
BEGIN
    CREATE UNIQUE INDEX UQ_fin_credit_encours
        ON dbo.fin_credit(employe_id) WHERE statut = N'EN_COURS';
    PRINT N'Index unique filtré UQ_fin_credit_encours créé (1 crédit en cours par employé).';
END

/* 3) Permission CREDIT_GERER ------------------------------------------------ */
IF NOT EXISTS (SELECT 1 FROM dbo.sec_permission WHERE code = N'CREDIT_GERER')
    INSERT INTO dbo.sec_permission(code, libelle, module)
    VALUES (N'CREDIT_GERER', N'Accorder / modifier les crédits employés', N'CREDIT');

INSERT INTO dbo.sec_role_permission(role_id, permission_id)
SELECT r.id, p.id
FROM dbo.sec_role r
JOIN dbo.sec_permission p ON p.code = N'CREDIT_GERER'
WHERE r.code IN (N'VALIDATEUR', N'SUPER_ADMIN', N'ADMINISTRATEUR', N'DAF')
  AND NOT EXISTS (
      SELECT 1 FROM dbo.sec_role_permission rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

PRINT N'Migration 0021 (crédit employé) terminée.';
GO
