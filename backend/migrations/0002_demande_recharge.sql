/* Table des demandes de recharge initiées par le demandeur.
   Workflow EN_ATTENTE → TRAITEE / REJETEE / ANNULEE. */
IF OBJECT_ID(N'dbo.fin_demande_recharge', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.fin_demande_recharge (
        id                       BIGINT IDENTITY(1,1) NOT NULL,
        numero                   NVARCHAR(50) NOT NULL,
        demandeur_id             BIGINT NOT NULL,
        portefeuille_id          BIGINT NOT NULL,
        montant                  DECIMAL(19,4) NOT NULL,
        motif                    NVARCHAR(500) NULL,
        statut                   NVARCHAR(20) NOT NULL CONSTRAINT DF_fin_dr_statut DEFAULT (N'EN_ATTENTE'),
        traite_par_id            BIGINT NULL,
        date_traitement          DATETIME2(3) NULL,
        commentaire_traitement   NVARCHAR(500) NULL,
        transaction_uuid         UNIQUEIDENTIFIER NULL,
        created_at               DATETIME2(3) NOT NULL CONSTRAINT DF_fin_dr_created DEFAULT SYSUTCDATETIME(),
        created_by_id            BIGINT NULL,
        updated_at               DATETIME2(3) NULL,
        updated_by_id            BIGINT NULL,
        deleted_at               DATETIME2(3) NULL,
        deleted_by_id            BIGINT NULL,
        version                  INT NOT NULL CONSTRAINT DF_fin_dr_version DEFAULT (1),
        CONSTRAINT PK_fin_demande_recharge PRIMARY KEY CLUSTERED (id),
        CONSTRAINT UQ_fin_dr_numero UNIQUE (numero),
        CONSTRAINT CK_fin_dr_statut CHECK (statut IN (N'EN_ATTENTE', N'TRAITEE', N'REJETEE', N'ANNULEE'))
    );
    CREATE INDEX IX_fin_dr_demandeur ON dbo.fin_demande_recharge(demandeur_id);
    CREATE INDEX IX_fin_dr_statut ON dbo.fin_demande_recharge(statut);
END
