/* ============================================================================
   MIGRATION — Bons dynamiques par type / Nom client / Nature comptable
               + Pays / Division + accès par division (restitutions)
   Base : npg_gestion_caisse (SQL Server)
   Idempotent : peut être exécuté plusieurs fois sans risque.
   ============================================================================ */

/* ----------------------------------------------------------------------------
   TRANCHE 2 — Type de bon + sous-bon
   ---------------------------------------------------------------------------- */

-- Flag « requiert nom client » sur le type de bon
IF COL_LENGTH('dbo.ref_type_bon', 'requiert_nom_client') IS NULL
    ALTER TABLE dbo.ref_type_bon
        ADD requiert_nom_client BIT NOT NULL CONSTRAINT DF_ref_tb_nomc DEFAULT 0;
GO

-- Nom client sur le sous-bon
IF COL_LENGTH('dbo.trx_sous_bon', 'nom_client') IS NULL
    ALTER TABLE dbo.trx_sous_bon ADD nom_client NVARCHAR(150) NULL;
GO

-- partenaire_id devient nullable (Avance / Restitution : pas de partenaire)
IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.trx_sous_bon')
      AND name = 'partenaire_id' AND is_nullable = 0
)
    ALTER TABLE dbo.trx_sous_bon ALTER COLUMN partenaire_id BIGINT NULL;
GO

-- Reconfiguration du type « Restitution Client »
UPDATE dbo.ref_type_bon
SET requiert_numero_client = 1,
    requiert_partenaire    = 0,
    requiert_bl            = 0,
    requiert_nom_client    = 1
WHERE code = N'RESTITUTION_CLIENT';
GO


/* ----------------------------------------------------------------------------
   TRANCHE 3 — Pays / Division + accès par division
   ---------------------------------------------------------------------------- */

-- Table Pays
IF OBJECT_ID('dbo.ref_pays', 'U') IS NULL
CREATE TABLE dbo.ref_pays (
    id              BIGINT IDENTITY(1,1) NOT NULL,
    code            NVARCHAR(10)  NOT NULL,
    libelle         NVARCHAR(150) NOT NULL,
    est_actif       BIT NOT NULL CONSTRAINT DF_ref_pays_actif DEFAULT 1,
    created_at      DATETIME2(3) NOT NULL CONSTRAINT DF_ref_pays_created DEFAULT SYSUTCDATETIME(),
    created_by_id   BIGINT NULL,
    updated_at      DATETIME2(3) NULL,
    updated_by_id   BIGINT NULL,
    deleted_at      DATETIME2(3) NULL,
    deleted_by_id   BIGINT NULL,
    version         INT NOT NULL CONSTRAINT DF_ref_pays_version DEFAULT 1,
    CONSTRAINT PK_ref_pays PRIMARY KEY CLUSTERED (id),
    CONSTRAINT UQ_ref_pays_code UNIQUE (code)
);
GO

-- Table Division (rattachée à un pays)
IF OBJECT_ID('dbo.ref_division', 'U') IS NULL
CREATE TABLE dbo.ref_division (
    id              BIGINT IDENTITY(1,1) NOT NULL,
    code            NVARCHAR(20)  NOT NULL,
    libelle         NVARCHAR(150) NOT NULL,
    pays_id         BIGINT NOT NULL,
    est_actif       BIT NOT NULL CONSTRAINT DF_ref_div_actif DEFAULT 1,
    created_at      DATETIME2(3) NOT NULL CONSTRAINT DF_ref_div_created DEFAULT SYSUTCDATETIME(),
    created_by_id   BIGINT NULL,
    updated_at      DATETIME2(3) NULL,
    updated_by_id   BIGINT NULL,
    deleted_at      DATETIME2(3) NULL,
    deleted_by_id   BIGINT NULL,
    version         INT NOT NULL CONSTRAINT DF_ref_div_version DEFAULT 1,
    CONSTRAINT PK_ref_division PRIMARY KEY CLUSTERED (id),
    CONSTRAINT UQ_ref_division_code UNIQUE (pays_id, code),
    CONSTRAINT FK_ref_division_pays FOREIGN KEY (pays_id) REFERENCES dbo.ref_pays(id)
);
GO

-- Accès utilisateur ↔ division
IF OBJECT_ID('dbo.sec_user_division_access', 'U') IS NULL
CREATE TABLE dbo.sec_user_division_access (
    user_id         BIGINT NOT NULL,
    division_id     BIGINT NOT NULL,
    created_at      DATETIME2(3) NOT NULL CONSTRAINT DF_sec_uda_created DEFAULT SYSUTCDATETIME(),
    created_by_id   BIGINT NULL,
    CONSTRAINT PK_sec_user_division_access PRIMARY KEY CLUSTERED (user_id, division_id),
    CONSTRAINT FK_sec_uda_user FOREIGN KEY (user_id) REFERENCES dbo.sec_user(id),
    CONSTRAINT FK_sec_uda_division FOREIGN KEY (division_id) REFERENCES dbo.ref_division(id)
);
GO

-- Pays / Division sur le sous-bon (restitution)
IF COL_LENGTH('dbo.trx_sous_bon', 'pays_id') IS NULL
    ALTER TABLE dbo.trx_sous_bon ADD pays_id BIGINT NULL;
GO
IF COL_LENGTH('dbo.trx_sous_bon', 'division_id') IS NULL
    ALTER TABLE dbo.trx_sous_bon ADD division_id BIGINT NULL;
GO


/* ----------------------------------------------------------------------------
   BONUS — Permission « voir tous les portefeuilles » (correctif antérieur)
   À garder si pas déjà appliqué ; sans effet si déjà présent.
   ---------------------------------------------------------------------------- */
IF NOT EXISTS (SELECT 1 FROM dbo.sec_permission WHERE code = N'PORTEFEUILLE_VOIR_TOUS')
    INSERT INTO dbo.sec_permission(code, libelle, module)
    VALUES (N'PORTEFEUILLE_VOIR_TOUS', N'Voir tous les portefeuilles (au-dela de son perimetre)', N'PORTEFEUILLE');
GO

INSERT INTO dbo.sec_role_permission(role_id, permission_id)
SELECT r.id, p.id
FROM dbo.sec_role r CROSS JOIN dbo.sec_permission p
WHERE r.code = N'CAISSIER' AND p.code = N'PORTEFEUILLE_VOIR_TOUS'
  AND NOT EXISTS (
      SELECT 1 FROM dbo.sec_role_permission rp
      WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );
GO

PRINT N'Migration bons / pays / division : OK';
GO
