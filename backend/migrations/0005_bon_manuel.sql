/* Bons manuels : carnets papier pré-numérotés + décaissements manuels (hors circuit).
   Idempotent. */

/* -- 1) Carnet de bons manuels ------------------------------------------------ */
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = N'trx_carnet')
BEGIN
    CREATE TABLE dbo.trx_carnet (
        id              BIGINT IDENTITY(1,1) NOT NULL,
        uuid            UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_trx_carnet_uuid DEFAULT NEWSEQUENTIALID(),
        libelle         NVARCHAR(150) NULL,
        caisse_id       BIGINT NOT NULL,
        caissier_id     BIGINT NOT NULL,
        numero_debut    INT NOT NULL,
        numero_fin      INT NOT NULL,
        prochain_numero INT NOT NULL,
        statut          NVARCHAR(20) NOT NULL CONSTRAINT DF_trx_carnet_statut DEFAULT N'ACTIF',
        created_at      DATETIME2(3) NOT NULL CONSTRAINT DF_trx_carnet_created DEFAULT SYSUTCDATETIME(),
        created_by_id   BIGINT NULL,
        updated_at      DATETIME2(3) NULL,
        updated_by_id   BIGINT NULL,
        deleted_at      DATETIME2(3) NULL,
        deleted_by_id   BIGINT NULL,
        version         INT NOT NULL CONSTRAINT DF_trx_carnet_version DEFAULT 1,
        CONSTRAINT PK_trx_carnet PRIMARY KEY CLUSTERED (id),
        CONSTRAINT UQ_trx_carnet_uuid UNIQUE (uuid),
        CONSTRAINT CK_trx_carnet_statut CHECK (statut IN (N'ACTIF', N'EPUISE', N'CLOTURE')),
        CONSTRAINT CK_trx_carnet_plage CHECK (numero_fin >= numero_debut)
    );
END

/* -- 2) Bon manuel ------------------------------------------------------------ */
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = N'trx_bon_manuel')
BEGIN
    CREATE TABLE dbo.trx_bon_manuel (
        id                    BIGINT IDENTITY(1,1) NOT NULL,
        uuid                  UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_trx_bon_manuel_uuid DEFAULT NEWSEQUENTIALID(),
        numero                NVARCHAR(50) NOT NULL,
        carnet_id             BIGINT NOT NULL,
        numero_manuel         INT NOT NULL,
        caissier_id           BIGINT NOT NULL,
        caisse_id             BIGINT NOT NULL,
        portefeuille_id       BIGINT NOT NULL,
        devise_id             BIGINT NOT NULL,
        montant               DECIMAL(19,4) NOT NULL,
        type_bon_id           BIGINT NULL,
        libelle               NVARCHAR(255) NULL,
        partenaire_id         BIGINT NULL,
        numero_bl             NVARCHAR(100) NULL,
        code_manutention      NVARCHAR(100) NULL,
        cost_center_id        BIGINT NULL,
        numero_client         NVARCHAR(50) NULL,
        description           NVARCHAR(500) NULL,
        donneur_ordre_user_id BIGINT NULL,
        donneur_ordre_nom     NVARCHAR(255) NULL,
        beneficiaire_nom      NVARCHAR(255) NOT NULL,
        motif                 NVARCHAR(500) NULL,
        statut                NVARCHAR(20) NOT NULL CONSTRAINT DF_trx_bon_manuel_statut DEFAULT N'DECAISSE',
        date_decaissement     DATETIME2(3) NOT NULL,
        created_at            DATETIME2(3) NOT NULL CONSTRAINT DF_trx_bon_manuel_created DEFAULT SYSUTCDATETIME(),
        created_by_id         BIGINT NULL,
        updated_at            DATETIME2(3) NULL,
        updated_by_id         BIGINT NULL,
        deleted_at            DATETIME2(3) NULL,
        deleted_by_id         BIGINT NULL,
        version               INT NOT NULL CONSTRAINT DF_trx_bon_manuel_version DEFAULT 1,
        CONSTRAINT PK_trx_bon_manuel PRIMARY KEY CLUSTERED (id),
        CONSTRAINT UQ_trx_bon_manuel_uuid UNIQUE (uuid),
        CONSTRAINT UQ_trx_bon_manuel_numero UNIQUE (numero),
        CONSTRAINT UQ_trx_bon_manuel_carnet_num UNIQUE (carnet_id, numero_manuel),
        CONSTRAINT CK_trx_bon_manuel_montant CHECK (montant > 0)
    );
END

/* -- 3) Colonnes « bon normal » ajoutées si la table existait déjà (idempotent) --- */
IF COL_LENGTH('dbo.trx_bon_manuel', 'type_bon_id') IS NULL
    ALTER TABLE dbo.trx_bon_manuel ADD type_bon_id BIGINT NULL;
IF COL_LENGTH('dbo.trx_bon_manuel', 'libelle') IS NULL
    ALTER TABLE dbo.trx_bon_manuel ADD libelle NVARCHAR(255) NULL;
IF COL_LENGTH('dbo.trx_bon_manuel', 'partenaire_id') IS NULL
    ALTER TABLE dbo.trx_bon_manuel ADD partenaire_id BIGINT NULL;
IF COL_LENGTH('dbo.trx_bon_manuel', 'numero_bl') IS NULL
    ALTER TABLE dbo.trx_bon_manuel ADD numero_bl NVARCHAR(100) NULL;
IF COL_LENGTH('dbo.trx_bon_manuel', 'code_manutention') IS NULL
    ALTER TABLE dbo.trx_bon_manuel ADD code_manutention NVARCHAR(100) NULL;
IF COL_LENGTH('dbo.trx_bon_manuel', 'cost_center_id') IS NULL
    ALTER TABLE dbo.trx_bon_manuel ADD cost_center_id BIGINT NULL;
IF COL_LENGTH('dbo.trx_bon_manuel', 'numero_client') IS NULL
    ALTER TABLE dbo.trx_bon_manuel ADD numero_client NVARCHAR(50) NULL;
IF COL_LENGTH('dbo.trx_bon_manuel', 'description') IS NULL
    ALTER TABLE dbo.trx_bon_manuel ADD description NVARCHAR(500) NULL;
