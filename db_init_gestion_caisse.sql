/* ============================================================================
   Application Fond de Caisse - DDL SQL Server
   ----------------------------------------------------------------------------
   Source           : MCD v2 (Bon = enveloppe legere, Sous-bon = coeur metier)
   Dialect          : Microsoft SQL Server 2019+
   Encodage         : UTF-16 LE / NVARCHAR partout
   Idempotent       : oui (IF NOT EXISTS sur chaque objet)
   Nb de tables     : 46
   Domaines         : sec_ (13)  ref_ (8)  fin_ (7)  trx_ (9)  aud_ (9)
   ----------------------------------------------------------------------------
   Conventions :
     - PK BIGINT IDENTITY(1,1)
     - UUID public en UNIQUEIDENTIFIER DEFAULT NEWSEQUENTIALID()
     - Argent en DECIMAL(19,4)
     - JSON en NVARCHAR(MAX) + CHECK ISJSON
     - Booleens en BIT
     - Dates en DATETIME2(3)
     - Soft delete : deleted_at / deleted_by_id sur tables metier
     - Verrou optimiste : colonne version INT
   ============================================================================ */

SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

/* ----------------------------------------------------------------------------
   1. CREATION DE LA BASE
   ---------------------------------------------------------------------------- */
USE master;
GO

IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = N'npg_gestion_caisse')
BEGIN
    CREATE DATABASE npg_gestion_caisse COLLATE French_CI_AS;
END
GO

ALTER DATABASE npg_gestion_caisse SET READ_COMMITTED_SNAPSHOT ON;
GO

USE npg_gestion_caisse;
GO


/* ============================================================================
   2. DOMAINE SECURITE (sec_) - 13 tables
   ============================================================================ */

/* -- sec_direction ---------------------------------------------------------- */
IF OBJECT_ID(N'dbo.sec_direction', N'U') IS NULL
CREATE TABLE dbo.sec_direction (
    id              BIGINT IDENTITY(1,1) NOT NULL,
    code            NVARCHAR(50)  NOT NULL,
    libelle         NVARCHAR(200) NOT NULL,
    description     NVARCHAR(MAX) NULL,
    est_actif       BIT NOT NULL CONSTRAINT DF_sec_direction_actif DEFAULT 1,
    created_at      DATETIME2(3) NOT NULL CONSTRAINT DF_sec_direction_created DEFAULT SYSUTCDATETIME(),
    created_by_id   BIGINT NULL,
    updated_at      DATETIME2(3) NULL,
    updated_by_id   BIGINT NULL,
    deleted_at      DATETIME2(3) NULL,
    deleted_by_id   BIGINT NULL,
    version         INT NOT NULL CONSTRAINT DF_sec_direction_version DEFAULT 1,
    CONSTRAINT PK_sec_direction PRIMARY KEY CLUSTERED (id),
    CONSTRAINT UQ_sec_direction_code UNIQUE (code)
);
GO

/* -- sec_role --------------------------------------------------------------- */
IF OBJECT_ID(N'dbo.sec_role', N'U') IS NULL
CREATE TABLE dbo.sec_role (
    id              BIGINT IDENTITY(1,1) NOT NULL,
    code            NVARCHAR(50)  NOT NULL,
    libelle         NVARCHAR(200) NOT NULL,
    description     NVARCHAR(MAX) NULL,
    est_systeme     BIT NOT NULL CONSTRAINT DF_sec_role_systeme DEFAULT 0,
    est_actif       BIT NOT NULL CONSTRAINT DF_sec_role_actif DEFAULT 1,
    created_at      DATETIME2(3) NOT NULL CONSTRAINT DF_sec_role_created DEFAULT SYSUTCDATETIME(),
    created_by_id   BIGINT NULL,
    updated_at      DATETIME2(3) NULL,
    updated_by_id   BIGINT NULL,
    deleted_at      DATETIME2(3) NULL,
    deleted_by_id   BIGINT NULL,
    version         INT NOT NULL CONSTRAINT DF_sec_role_version DEFAULT 1,
    CONSTRAINT PK_sec_role PRIMARY KEY CLUSTERED (id),
    CONSTRAINT UQ_sec_role_code UNIQUE (code),
    CONSTRAINT CK_sec_role_code CHECK (code IN
        (N'SUPER_ADMIN', N'ADMINISTRATEUR', N'VALIDATEUR', N'DEMANDEUR', N'CAISSIER', N'GESTIONNAIRE_PORTEFEUILLE', N'DAF'))
);
GO

/* -- sec_permission --------------------------------------------------------- */
IF OBJECT_ID(N'dbo.sec_permission', N'U') IS NULL
CREATE TABLE dbo.sec_permission (
    id              BIGINT IDENTITY(1,1) NOT NULL,
    code            NVARCHAR(100) NOT NULL,
    libelle         NVARCHAR(200) NOT NULL,
    module          NVARCHAR(50)  NOT NULL,
    description     NVARCHAR(MAX) NULL,
    est_actif       BIT NOT NULL CONSTRAINT DF_sec_permission_actif DEFAULT 1,
    created_at      DATETIME2(3) NOT NULL CONSTRAINT DF_sec_permission_created DEFAULT SYSUTCDATETIME(),
    created_by_id   BIGINT NULL,
    updated_at      DATETIME2(3) NULL,
    updated_by_id   BIGINT NULL,
    deleted_at      DATETIME2(3) NULL,
    deleted_by_id   BIGINT NULL,
    version         INT NOT NULL CONSTRAINT DF_sec_permission_version DEFAULT 1,
    CONSTRAINT PK_sec_permission PRIMARY KEY CLUSTERED (id),
    CONSTRAINT UQ_sec_permission_code UNIQUE (code)
);
GO

/* -- sec_profil ------------------------------------------------------------- */
IF OBJECT_ID(N'dbo.sec_profil', N'U') IS NULL
CREATE TABLE dbo.sec_profil (
    id              BIGINT IDENTITY(1,1) NOT NULL,
    code            NVARCHAR(50)  NOT NULL,
    libelle         NVARCHAR(200) NOT NULL,
    description     NVARCHAR(MAX) NULL,
    categorie       NVARCHAR(20)  NOT NULL,
    est_actif       BIT NOT NULL CONSTRAINT DF_sec_profil_actif DEFAULT 1,
    created_at      DATETIME2(3) NOT NULL CONSTRAINT DF_sec_profil_created DEFAULT SYSUTCDATETIME(),
    created_by_id   BIGINT NULL,
    updated_at      DATETIME2(3) NULL,
    updated_by_id   BIGINT NULL,
    deleted_at      DATETIME2(3) NULL,
    deleted_by_id   BIGINT NULL,
    version         INT NOT NULL CONSTRAINT DF_sec_profil_version DEFAULT 1,
    CONSTRAINT PK_sec_profil PRIMARY KEY CLUSTERED (id),
    CONSTRAINT UQ_sec_profil_code UNIQUE (code),
    CONSTRAINT CK_sec_profil_categorie CHECK (categorie IN
        (N'VALIDATEUR', N'DEMANDEUR', N'CAISSIER', N'INTERIM'))
);
GO

/* -- sec_user --------------------------------------------------------------- */
IF OBJECT_ID(N'dbo.sec_user', N'U') IS NULL
CREATE TABLE dbo.sec_user (
    id                  BIGINT IDENTITY(1,1) NOT NULL,
    uuid                UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_sec_user_uuid DEFAULT NEWSEQUENTIALID(),
    matricule           NVARCHAR(50)  NOT NULL,
    nom                 NVARCHAR(100) NOT NULL,
    prenom              NVARCHAR(100) NOT NULL,
    email               NVARCHAR(200) NOT NULL,
    telephone           NVARCHAR(30)  NULL,
    mot_de_passe_hash   NVARCHAR(255) NOT NULL,
    direction_id        BIGINT NULL,
    cost_center_id      BIGINT NULL,                -- FK ref_cost_center : CC principal
    est_actif           BIT NOT NULL CONSTRAINT DF_sec_user_actif DEFAULT 1,
    acces_web           BIT NOT NULL CONSTRAINT DF_sec_user_acces_web DEFAULT 1,
    acces_mobile        BIT NOT NULL CONSTRAINT DF_sec_user_acces_mobile DEFAULT 1,
    derniere_connexion  DATETIME2(3) NULL,
    created_at          DATETIME2(3) NOT NULL CONSTRAINT DF_sec_user_created DEFAULT SYSUTCDATETIME(),
    created_by_id       BIGINT NULL,
    updated_at          DATETIME2(3) NULL,
    updated_by_id       BIGINT NULL,
    deleted_at          DATETIME2(3) NULL,
    deleted_by_id       BIGINT NULL,
    version             INT NOT NULL CONSTRAINT DF_sec_user_version DEFAULT 1,
    CONSTRAINT PK_sec_user PRIMARY KEY CLUSTERED (id),
    CONSTRAINT UQ_sec_user_uuid UNIQUE (uuid),
    CONSTRAINT UQ_sec_user_matricule UNIQUE (matricule),
    CONSTRAINT UQ_sec_user_email UNIQUE (email)
);
GO

/* -- sec_user_role (table de liaison) --------------------------------------- */
IF OBJECT_ID(N'dbo.sec_user_role', N'U') IS NULL
CREATE TABLE dbo.sec_user_role (
    user_id             BIGINT NOT NULL,
    role_id             BIGINT NOT NULL,
    date_attribution    DATETIME2(3) NOT NULL CONSTRAINT DF_sec_user_role_date DEFAULT SYSUTCDATETIME(),
    attribue_par_id     BIGINT NULL,
    CONSTRAINT PK_sec_user_role PRIMARY KEY CLUSTERED (user_id, role_id)
);
GO

/* -- sec_role_permission ---------------------------------------------------- */
IF OBJECT_ID(N'dbo.sec_role_permission', N'U') IS NULL
CREATE TABLE dbo.sec_role_permission (
    role_id         BIGINT NOT NULL,
    permission_id   BIGINT NOT NULL,
    CONSTRAINT PK_sec_role_permission PRIMARY KEY CLUSTERED (role_id, permission_id)
);
GO

/* -- sec_user_profil -------------------------------------------------------- */
IF OBJECT_ID(N'dbo.sec_user_profil', N'U') IS NULL
CREATE TABLE dbo.sec_user_profil (
    user_id             BIGINT NOT NULL,
    profil_id           BIGINT NOT NULL,
    date_attribution    DATETIME2(3) NOT NULL CONSTRAINT DF_sec_user_profil_date DEFAULT SYSUTCDATETIME(),
    attribue_par_id     BIGINT NULL,
    CONSTRAINT PK_sec_user_profil PRIMARY KEY CLUSTERED (user_id, profil_id)
);
GO

/* -- sec_profil_permission -------------------------------------------------- */
IF OBJECT_ID(N'dbo.sec_profil_permission', N'U') IS NULL
CREATE TABLE dbo.sec_profil_permission (
    profil_id       BIGINT NOT NULL,
    permission_id   BIGINT NOT NULL,
    CONSTRAINT PK_sec_profil_permission PRIMARY KEY CLUSTERED (profil_id, permission_id)
);
GO

/* -- sec_user_caisse_access ------------------------------------------------- */
IF OBJECT_ID(N'dbo.sec_user_caisse_access', N'U') IS NULL
CREATE TABLE dbo.sec_user_caisse_access (
    user_id         BIGINT NOT NULL,
    caisse_id       BIGINT NOT NULL,
    niveau_acces    NVARCHAR(20) NOT NULL,
    created_at      DATETIME2(3) NOT NULL CONSTRAINT DF_sec_uca_created DEFAULT SYSUTCDATETIME(),
    created_by_id   BIGINT NULL,
    CONSTRAINT PK_sec_user_caisse_access PRIMARY KEY CLUSTERED (user_id, caisse_id),
    CONSTRAINT CK_sec_user_caisse_access_niveau CHECK (niveau_acces IN
        (N'LECTURE', N'ECRITURE', N'ADMIN'))
);
GO

/* -- sec_user_cost_center --------------------------------------------------- */
IF OBJECT_ID(N'dbo.sec_user_cost_center', N'U') IS NULL
CREATE TABLE dbo.sec_user_cost_center (
    user_id         BIGINT NOT NULL,
    cost_center_id  BIGINT NOT NULL,
    est_principal   BIT NOT NULL CONSTRAINT DF_sec_ucc_principal DEFAULT 0,
    created_at      DATETIME2(3) NOT NULL CONSTRAINT DF_sec_ucc_created DEFAULT SYSUTCDATETIME(),
    created_by_id   BIGINT NULL,
    CONSTRAINT PK_sec_user_cost_center PRIMARY KEY CLUSTERED (user_id, cost_center_id)
);
GO

/* -- sec_user_permission_extra ---------------------------------------------- */
IF OBJECT_ID(N'dbo.sec_user_permission_extra', N'U') IS NULL
CREATE TABLE dbo.sec_user_permission_extra (
    id              BIGINT IDENTITY(1,1) NOT NULL,
    user_id         BIGINT NOT NULL,
    permission_id   BIGINT NOT NULL,
    scope_type      NVARCHAR(20)  NULL,
    scope_id        BIGINT        NULL,
    date_debut      DATETIME2(3)  NULL,
    date_fin        DATETIME2(3)  NULL,
    accorde_par_id  BIGINT NULL,
    motif           NVARCHAR(500) NULL,
    est_actif       BIT NOT NULL CONSTRAINT DF_sec_upe_actif DEFAULT 1,
    created_at      DATETIME2(3) NOT NULL CONSTRAINT DF_sec_upe_created DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_sec_user_permission_extra PRIMARY KEY CLUSTERED (id),
    CONSTRAINT CK_sec_upe_scope CHECK (scope_type IS NULL OR scope_type IN
        (N'CAISSE', N'BON', N'PORTEFEUILLE', N'SOUS_BON', N'PARTENAIRE'))
);
GO

/* -- sec_interim ------------------------------------------------------------ */
IF OBJECT_ID(N'dbo.sec_interim', N'U') IS NULL
CREATE TABLE dbo.sec_interim (
    id                      BIGINT IDENTITY(1,1) NOT NULL,
    initiateur_id           BIGINT NOT NULL,
    remplacant_id           BIGINT NOT NULL,
    permission_id           BIGINT NULL,
    role_transferre_id      BIGINT NULL,
    profil_transferre_id    BIGINT NULL,
    date_debut              DATETIME2(3) NOT NULL,
    date_fin                DATETIME2(3) NOT NULL,
    commentaire             NVARCHAR(500) NULL,
    statut                  NVARCHAR(20) NOT NULL CONSTRAINT DF_sec_interim_statut DEFAULT N'ACTIF',
    created_at              DATETIME2(3) NOT NULL CONSTRAINT DF_sec_interim_created DEFAULT SYSUTCDATETIME(),
    created_by_id           BIGINT NULL,
    updated_at              DATETIME2(3) NULL,
    updated_by_id           BIGINT NULL,
    CONSTRAINT PK_sec_interim PRIMARY KEY CLUSTERED (id),
    CONSTRAINT CK_sec_interim_statut CHECK (statut IN (N'ACTIF', N'EXPIRE', N'REVOQUE')),
    CONSTRAINT CK_sec_interim_dates CHECK (date_fin > date_debut),
    CONSTRAINT CK_sec_interim_distinct CHECK (initiateur_id <> remplacant_id)
);
GO


/* ============================================================================
   3. DOMAINE REFERENTIEL (ref_) - 8 tables
   ============================================================================ */

/* -- ref_plan_comptable (auto-reference) ------------------------------------ */
IF OBJECT_ID(N'dbo.ref_plan_comptable', N'U') IS NULL
CREATE TABLE dbo.ref_plan_comptable (
    id              BIGINT IDENTITY(1,1) NOT NULL,
    numero_compte   NVARCHAR(50)  NOT NULL,
    libelle         NVARCHAR(200) NOT NULL,
    type_compte     NVARCHAR(20)  NOT NULL,
    parent_id       BIGINT NULL,
    est_actif       BIT NOT NULL CONSTRAINT DF_ref_pc_actif DEFAULT 1,
    created_at      DATETIME2(3) NOT NULL CONSTRAINT DF_ref_pc_created DEFAULT SYSUTCDATETIME(),
    created_by_id   BIGINT NULL,
    updated_at      DATETIME2(3) NULL,
    updated_by_id   BIGINT NULL,
    deleted_at      DATETIME2(3) NULL,
    deleted_by_id   BIGINT NULL,
    version         INT NOT NULL CONSTRAINT DF_ref_pc_version DEFAULT 1,
    CONSTRAINT PK_ref_plan_comptable PRIMARY KEY CLUSTERED (id),
    CONSTRAINT UQ_ref_plan_comptable_numero UNIQUE (numero_compte)
);
GO

/* -- ref_cost_center -------------------------------------------------------- */
IF OBJECT_ID(N'dbo.ref_cost_center', N'U') IS NULL
CREATE TABLE dbo.ref_cost_center (
    id              BIGINT IDENTITY(1,1) NOT NULL,
    code            NVARCHAR(50)  NOT NULL,
    libelle         NVARCHAR(200) NOT NULL,
    direction_id    BIGINT NULL,
    budget_annuel   DECIMAL(19,4) NULL,
    est_actif       BIT NOT NULL CONSTRAINT DF_ref_cc_actif DEFAULT 1,
    created_at      DATETIME2(3) NOT NULL CONSTRAINT DF_ref_cc_created DEFAULT SYSUTCDATETIME(),
    created_by_id   BIGINT NULL,
    updated_at      DATETIME2(3) NULL,
    updated_by_id   BIGINT NULL,
    deleted_at      DATETIME2(3) NULL,
    deleted_by_id   BIGINT NULL,
    version         INT NOT NULL CONSTRAINT DF_ref_cc_version DEFAULT 1,
    CONSTRAINT PK_ref_cost_center PRIMARY KEY CLUSTERED (id),
    CONSTRAINT UQ_ref_cost_center_code UNIQUE (code)
);
GO

/* -- ref_nature_operation --------------------------------------------------- */
IF OBJECT_ID(N'dbo.ref_nature_operation', N'U') IS NULL
CREATE TABLE dbo.ref_nature_operation (
    id                  BIGINT IDENTITY(1,1) NOT NULL,
    code                NVARCHAR(50)  NOT NULL,
    libelle             NVARCHAR(200) NOT NULL,
    cost_center_id      BIGINT NULL,
    plan_comptable_id   BIGINT NULL,
    est_actif           BIT NOT NULL CONSTRAINT DF_ref_no_actif DEFAULT 1,
    created_at          DATETIME2(3) NOT NULL CONSTRAINT DF_ref_no_created DEFAULT SYSUTCDATETIME(),
    created_by_id       BIGINT NULL,
    updated_at          DATETIME2(3) NULL,
    updated_by_id       BIGINT NULL,
    deleted_at          DATETIME2(3) NULL,
    deleted_by_id       BIGINT NULL,
    version             INT NOT NULL CONSTRAINT DF_ref_no_version DEFAULT 1,
    CONSTRAINT PK_ref_nature_operation PRIMARY KEY CLUSTERED (id),
    CONSTRAINT UQ_ref_nature_operation_code UNIQUE (code)
);
GO

/* -- ref_nature_comptable (cache local SAP) --------------------------------- */
IF OBJECT_ID(N'dbo.ref_nature_comptable', N'U') IS NULL
CREATE TABLE dbo.ref_nature_comptable (
    id                  BIGINT IDENTITY(1,1) NOT NULL,
    libelle             NVARCHAR(200) NOT NULL,
    description         NVARCHAR(MAX) NULL,
    cost_center_id      BIGINT NULL,
    plan_comptable_id   BIGINT NULL,
    code_comptable_sap  NVARCHAR(50)  NULL,
    est_actif           BIT NOT NULL CONSTRAINT DF_ref_nc_actif DEFAULT 1,
    created_at          DATETIME2(3) NOT NULL CONSTRAINT DF_ref_nc_created DEFAULT SYSUTCDATETIME(),
    created_by_id       BIGINT NULL,
    updated_at          DATETIME2(3) NULL,
    updated_by_id       BIGINT NULL,
    deleted_at          DATETIME2(3) NULL,
    deleted_by_id       BIGINT NULL,
    version             INT NOT NULL CONSTRAINT DF_ref_nc_version DEFAULT 1,
    CONSTRAINT PK_ref_nature_comptable PRIMARY KEY CLUSTERED (id),
    CONSTRAINT UQ_ref_nature_comptable_libelle UNIQUE (libelle)
);
GO

/* -- ref_partenaire (unifie client + fournisseur) --------------------------- */
IF OBJECT_ID(N'dbo.ref_partenaire', N'U') IS NULL
CREATE TABLE dbo.ref_partenaire (
    id                  BIGINT IDENTITY(1,1) NOT NULL,
    uuid                UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_ref_partenaire_uuid DEFAULT NEWSEQUENTIALID(),
    code                NVARCHAR(50)  NOT NULL,
    raison_sociale      NVARCHAR(255) NOT NULL,
    sigle               NVARCHAR(50)  NULL,
    type_partenaire     NVARCHAR(20)  NOT NULL,
    numero_client       NVARCHAR(50)  NULL,
    adresse             NVARCHAR(500) NULL,
    telephone           NVARCHAR(30)  NULL,
    email               NVARCHAR(200) NULL,
    pays                NVARCHAR(100) NULL,
    ville               NVARCHAR(100) NULL,
    est_actif           BIT NOT NULL CONSTRAINT DF_ref_partenaire_actif DEFAULT 1,
    created_at          DATETIME2(3) NOT NULL CONSTRAINT DF_ref_partenaire_created DEFAULT SYSUTCDATETIME(),
    created_by_id       BIGINT NULL,
    updated_at          DATETIME2(3) NULL,
    updated_by_id       BIGINT NULL,
    deleted_at          DATETIME2(3) NULL,
    deleted_by_id       BIGINT NULL,
    version             INT NOT NULL CONSTRAINT DF_ref_partenaire_version DEFAULT 1,
    CONSTRAINT PK_ref_partenaire PRIMARY KEY CLUSTERED (id),
    CONSTRAINT UQ_ref_partenaire_uuid UNIQUE (uuid),
    CONSTRAINT UQ_ref_partenaire_code UNIQUE (code),
    CONSTRAINT CK_ref_partenaire_type CHECK (type_partenaire IN
        (N'CLIENT', N'FOURNISSEUR', N'MIXTE'))
);
GO

/* Index unique filtre sur numero_client (uniquement les clients renseignes) */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_ref_partenaire_numero_client' AND object_id = OBJECT_ID(N'dbo.ref_partenaire'))
CREATE UNIQUE NONCLUSTERED INDEX UX_ref_partenaire_numero_client
    ON dbo.ref_partenaire(numero_client) WHERE numero_client IS NOT NULL;
GO

/* -- ref_partenaire_nature_comptable ---------------------------------------- */
IF OBJECT_ID(N'dbo.ref_partenaire_nature_comptable', N'U') IS NULL
CREATE TABLE dbo.ref_partenaire_nature_comptable (
    partenaire_id           BIGINT NOT NULL,
    nature_comptable_id     BIGINT NOT NULL,
    est_par_defaut          BIT NOT NULL CONSTRAINT DF_ref_pnc_defaut DEFAULT 0,
    created_at              DATETIME2(3) NOT NULL CONSTRAINT DF_ref_pnc_created DEFAULT SYSUTCDATETIME(),
    created_by_id           BIGINT NULL,
    CONSTRAINT PK_ref_partenaire_nature_comptable PRIMARY KEY CLUSTERED (partenaire_id, nature_comptable_id)
);
GO

/* -- ref_site --------------------------------------------------------------- */
IF OBJECT_ID(N'dbo.ref_site', N'U') IS NULL
CREATE TABLE dbo.ref_site (
    id              BIGINT IDENTITY(1,1) NOT NULL,
    code            NVARCHAR(50)  NOT NULL,
    libelle         NVARCHAR(200) NOT NULL,
    adresse         NVARCHAR(500) NULL,
    ville           NVARCHAR(100) NULL,
    pays            NVARCHAR(100) NULL,
    direction_id    BIGINT NULL,
    est_actif       BIT NOT NULL CONSTRAINT DF_ref_site_actif DEFAULT 1,
    created_at      DATETIME2(3) NOT NULL CONSTRAINT DF_ref_site_created DEFAULT SYSUTCDATETIME(),
    created_by_id   BIGINT NULL,
    updated_at      DATETIME2(3) NULL,
    updated_by_id   BIGINT NULL,
    deleted_at      DATETIME2(3) NULL,
    deleted_by_id   BIGINT NULL,
    version         INT NOT NULL CONSTRAINT DF_ref_site_version DEFAULT 1,
    CONSTRAINT PK_ref_site PRIMARY KEY CLUSTERED (id),
    CONSTRAINT UQ_ref_site_code UNIQUE (code)
);
GO

/* -- ref_type_bon ----------------------------------------------------------- */
IF OBJECT_ID(N'dbo.ref_type_bon', N'U') IS NULL
CREATE TABLE dbo.ref_type_bon (
    id                          BIGINT IDENTITY(1,1) NOT NULL,
    code                        NVARCHAR(50)  NOT NULL,
    libelle                     NVARCHAR(200) NOT NULL,
    description                 NVARCHAR(MAX) NULL,
    requiert_numero_client      BIT NOT NULL CONSTRAINT DF_ref_tb_nc DEFAULT 0,
    requiert_partenaire         BIT NOT NULL CONSTRAINT DF_ref_tb_p DEFAULT 1,
    requiert_bl                 BIT NOT NULL CONSTRAINT DF_ref_tb_bl DEFAULT 1,
    est_actif                   BIT NOT NULL CONSTRAINT DF_ref_tb_actif DEFAULT 1,
    created_at                  DATETIME2(3) NOT NULL CONSTRAINT DF_ref_tb_created DEFAULT SYSUTCDATETIME(),
    created_by_id               BIGINT NULL,
    updated_at                  DATETIME2(3) NULL,
    updated_by_id               BIGINT NULL,
    deleted_at                  DATETIME2(3) NULL,
    deleted_by_id               BIGINT NULL,
    version                     INT NOT NULL CONSTRAINT DF_ref_tb_version DEFAULT 1,
    CONSTRAINT PK_ref_type_bon PRIMARY KEY CLUSTERED (id),
    CONSTRAINT UQ_ref_type_bon_code UNIQUE (code)
);
GO


/* ============================================================================
   4. DOMAINE FINANCIER (fin_) - 7 tables
   ============================================================================ */

/* -- fin_devise ------------------------------------------------------------- */
IF OBJECT_ID(N'dbo.fin_devise', N'U') IS NULL
CREATE TABLE dbo.fin_devise (
    id              BIGINT IDENTITY(1,1) NOT NULL,
    code            NVARCHAR(10)  NOT NULL,
    libelle         NVARCHAR(100) NOT NULL,
    symbole         NVARCHAR(10)  NULL,
    nb_decimales    INT NOT NULL CONSTRAINT DF_fin_devise_dec DEFAULT 2,
    est_actif       BIT NOT NULL CONSTRAINT DF_fin_devise_actif DEFAULT 1,
    created_at      DATETIME2(3) NOT NULL CONSTRAINT DF_fin_devise_created DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_fin_devise PRIMARY KEY CLUSTERED (id),
    CONSTRAINT UQ_fin_devise_code UNIQUE (code),
    CONSTRAINT CK_fin_devise_dec CHECK (nb_decimales BETWEEN 0 AND 8)
);
GO

/* -- fin_taux_echange ------------------------------------------------------- */
IF OBJECT_ID(N'dbo.fin_taux_echange', N'U') IS NULL
CREATE TABLE dbo.fin_taux_echange (
    id                      BIGINT IDENTITY(1,1) NOT NULL,
    devise_source_id        BIGINT NOT NULL,
    devise_cible_id         BIGINT NOT NULL,
    taux                    DECIMAL(19,8) NOT NULL,
    date_validite_debut     DATETIME2(3) NOT NULL,
    date_validite_fin       DATETIME2(3) NULL,
    source                  NVARCHAR(20) NOT NULL,
    created_at              DATETIME2(3) NOT NULL CONSTRAINT DF_fin_te_created DEFAULT SYSUTCDATETIME(),
    created_by_id           BIGINT NULL,
    CONSTRAINT PK_fin_taux_echange PRIMARY KEY CLUSTERED (id),
    CONSTRAINT CK_fin_te_source CHECK (source IN (N'FIXE_DB', N'API')),
    CONSTRAINT CK_fin_te_taux CHECK (taux > 0),
    CONSTRAINT CK_fin_te_devises CHECK (devise_source_id <> devise_cible_id),
    CONSTRAINT CK_fin_te_dates CHECK (date_validite_fin IS NULL OR date_validite_fin > date_validite_debut)
);
GO

/* -- fin_caisse ------------------------------------------------------------- */
IF OBJECT_ID(N'dbo.fin_caisse', N'U') IS NULL
CREATE TABLE dbo.fin_caisse (
    id              BIGINT IDENTITY(1,1) NOT NULL,
    code            NVARCHAR(50)  NOT NULL,
    libelle         NVARCHAR(200) NOT NULL,
    devise_id       BIGINT NOT NULL,
    caissier_id     BIGINT NULL,
    site_id         BIGINT NULL,
    est_principale  BIT NOT NULL CONSTRAINT DF_fin_caisse_principale DEFAULT 0,
    statut          NVARCHAR(20) NOT NULL CONSTRAINT DF_fin_caisse_statut DEFAULT N'FERMEE',
    created_at      DATETIME2(3) NOT NULL CONSTRAINT DF_fin_caisse_created DEFAULT SYSUTCDATETIME(),
    created_by_id   BIGINT NULL,
    updated_at      DATETIME2(3) NULL,
    updated_by_id   BIGINT NULL,
    deleted_at      DATETIME2(3) NULL,
    deleted_by_id   BIGINT NULL,
    version         INT NOT NULL CONSTRAINT DF_fin_caisse_version DEFAULT 1,
    CONSTRAINT PK_fin_caisse PRIMARY KEY CLUSTERED (id),
    CONSTRAINT UQ_fin_caisse_code UNIQUE (code),
    CONSTRAINT CK_fin_caisse_statut CHECK (statut IN (N'OUVERTE', N'FERMEE'))
);
GO

/* -- fin_session_caisse ----------------------------------------------------- */
IF OBJECT_ID(N'dbo.fin_session_caisse', N'U') IS NULL
CREATE TABLE dbo.fin_session_caisse (
    id                  BIGINT IDENTITY(1,1) NOT NULL,
    caisse_id           BIGINT NOT NULL,
    date_ouverture      DATETIME2(3) NOT NULL,
    date_cloture        DATETIME2(3) NULL,
    solde_ouverture     DECIMAL(19,4) NOT NULL CONSTRAINT DF_fin_sc_so DEFAULT 0,
    solde_cloture       DECIMAL(19,4) NULL,
    cloture_par_id      BIGINT NULL,
    type_cloture        NVARCHAR(20) NULL,
    statut              NVARCHAR(20) NOT NULL CONSTRAINT DF_fin_sc_statut DEFAULT N'OUVERTE',
    created_at          DATETIME2(3) NOT NULL CONSTRAINT DF_fin_sc_created DEFAULT SYSUTCDATETIME(),
    created_by_id       BIGINT NULL,
    CONSTRAINT PK_fin_session_caisse PRIMARY KEY CLUSTERED (id),
    CONSTRAINT CK_fin_sc_type_cloture CHECK (type_cloture IS NULL OR type_cloture IN (N'AUTO_20H', N'MANUEL')),
    CONSTRAINT CK_fin_sc_statut CHECK (statut IN (N'OUVERTE', N'FERMEE'))
);
GO

/* Index filtre : une seule session OUVERTE par caisse */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_fin_session_caisse_ouverte' AND object_id = OBJECT_ID(N'dbo.fin_session_caisse'))
CREATE UNIQUE NONCLUSTERED INDEX UX_fin_session_caisse_ouverte
    ON dbo.fin_session_caisse(caisse_id) WHERE statut = N'OUVERTE';
GO

/* -- fin_portefeuille ------------------------------------------------------- */
IF OBJECT_ID(N'dbo.fin_portefeuille', N'U') IS NULL
CREATE TABLE dbo.fin_portefeuille (
    id                  BIGINT IDENTITY(1,1) NOT NULL,
    uuid                UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_fin_pf_uuid DEFAULT NEWSEQUENTIALID(),
    code                NVARCHAR(50)  NOT NULL,
    libelle             NVARCHAR(200) NOT NULL,
    caisse_source_id    BIGINT NOT NULL,
    devise_id           BIGINT NOT NULL,
    site_id             BIGINT NULL,
    proprietaire_type   NVARCHAR(20) NOT NULL,
    proprietaire_id     BIGINT NOT NULL,
    solde_initial       DECIMAL(19,4) NOT NULL CONSTRAINT DF_fin_pf_solde DEFAULT 0,
    est_actif           BIT NOT NULL CONSTRAINT DF_fin_pf_actif DEFAULT 1,
    created_at          DATETIME2(3) NOT NULL CONSTRAINT DF_fin_pf_created DEFAULT SYSUTCDATETIME(),
    created_by_id       BIGINT NULL,
    updated_at          DATETIME2(3) NULL,
    updated_by_id       BIGINT NULL,
    deleted_at          DATETIME2(3) NULL,
    deleted_by_id       BIGINT NULL,
    version             INT NOT NULL CONSTRAINT DF_fin_pf_version DEFAULT 1,
    CONSTRAINT PK_fin_portefeuille PRIMARY KEY CLUSTERED (id),
    CONSTRAINT UQ_fin_portefeuille_uuid UNIQUE (uuid),
    CONSTRAINT UQ_fin_portefeuille_code UNIQUE (code),
    CONSTRAINT CK_fin_pf_type CHECK (proprietaire_type IN (N'USER', N'DIRECTION'))
);
GO

/* -- fin_compte_gain_change ------------------------------------------------- */
IF OBJECT_ID(N'dbo.fin_compte_gain_change', N'U') IS NULL
CREATE TABLE dbo.fin_compte_gain_change (
    id              BIGINT IDENTITY(1,1) NOT NULL,
    devise_id       BIGINT NOT NULL,
    description     NVARCHAR(500) NULL,
    created_at      DATETIME2(3) NOT NULL CONSTRAINT DF_fin_cgc_created DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_fin_compte_gain_change PRIMARY KEY CLUSTERED (id),
    CONSTRAINT UQ_fin_compte_gain_change_devise UNIQUE (devise_id)
);
GO

/* -- fin_compte_perte_change ------------------------------------------------ */
IF OBJECT_ID(N'dbo.fin_compte_perte_change', N'U') IS NULL
CREATE TABLE dbo.fin_compte_perte_change (
    id              BIGINT IDENTITY(1,1) NOT NULL,
    devise_id       BIGINT NOT NULL,
    description     NVARCHAR(500) NULL,
    created_at      DATETIME2(3) NOT NULL CONSTRAINT DF_fin_cpc_created DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_fin_compte_perte_change PRIMARY KEY CLUSTERED (id),
    CONSTRAINT UQ_fin_compte_perte_change_devise UNIQUE (devise_id)
);
GO


/* ============================================================================
   5. DOMAINE TRANSACTIONNEL (trx_) - 9 tables
   ============================================================================ */

/* -- trx_bon (enveloppe legere) --------------------------------------------- */
IF OBJECT_ID(N'dbo.trx_bon', N'U') IS NULL
CREATE TABLE dbo.trx_bon (
    id                      BIGINT IDENTITY(1,1) NOT NULL,
    uuid                    UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_trx_bon_uuid DEFAULT NEWSEQUENTIALID(),
    numero                  NVARCHAR(50) NOT NULL,
    demandeur_id            BIGINT NOT NULL,
    cree_par_interim_id     BIGINT NULL,
    type_bon_id             BIGINT NOT NULL,
    statut                  NVARCHAR(20) NOT NULL CONSTRAINT DF_trx_bon_statut DEFAULT N'CREE',
    est_recurrent           BIT NOT NULL CONSTRAINT DF_trx_bon_recurrent DEFAULT 0,
    frequence_recurrence    NVARCHAR(20) NULL,
    bon_parent_id           BIGINT NULL,
    montant_total           DECIMAL(19,4) NOT NULL CONSTRAINT DF_trx_bon_total DEFAULT 0,
    demande_extension       BIT NOT NULL CONSTRAINT DF_trx_bon_demande_ext DEFAULT 0,  -- le demandeur a sollicite une extension de budget
    description_extension   NVARCHAR(500) NULL,                -- justification optionnelle de la demande d'extension
    statut_extension        NVARCHAR(20) NOT NULL CONSTRAINT DF_trx_bon_statut_ext DEFAULT 'NON',  -- NON / EN_ATTENTE / APPROUVEE / REFUSEE
    extension_mode          NVARCHAR(20) NULL,                 -- DECOUVERT | RECHARGE (choisi a l'approbation)
    extension_decide_par_id BIGINT NULL,                       -- approbateur
    extension_date_decision DATETIME2(3) NULL,
    extension_commentaire   NVARCHAR(500) NULL,                -- commentaire de l'approbateur
    porteur                 NVARCHAR(255) NULL,                -- personne qui se presentera a la caisse (texte libre, optionnel)
    created_at              DATETIME2(3) NOT NULL CONSTRAINT DF_trx_bon_created DEFAULT SYSUTCDATETIME(),
    created_by_id           BIGINT NULL,
    updated_at              DATETIME2(3) NULL,
    updated_by_id           BIGINT NULL,
    deleted_at              DATETIME2(3) NULL,
    deleted_by_id           BIGINT NULL,
    version                 INT NOT NULL CONSTRAINT DF_trx_bon_version DEFAULT 1,
    CONSTRAINT PK_trx_bon PRIMARY KEY CLUSTERED (id),
    CONSTRAINT UQ_trx_bon_uuid UNIQUE (uuid),
    CONSTRAINT UQ_trx_bon_numero UNIQUE (numero),
    CONSTRAINT CK_trx_bon_statut CHECK (statut IN
        (N'CREE', N'VALIDE', N'DECAISSE', N'COMPTABILISE', N'ANNULE', N'REFUSE')),
    CONSTRAINT CK_trx_bon_freq CHECK (frequence_recurrence IS NULL OR frequence_recurrence IN
        (N'MENSUEL', N'TRIMESTRIEL', N'SEMESTRIEL', N'ANNUEL')),
    CONSTRAINT CK_trx_bon_total CHECK (montant_total >= 0)
);
GO

/* -- trx_sous_bon (cœur metier) --------------------------------------------- */
IF OBJECT_ID(N'dbo.trx_sous_bon', N'U') IS NULL
CREATE TABLE dbo.trx_sous_bon (
    id                          BIGINT IDENTITY(1,1) NOT NULL,
    uuid                        UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_trx_sb_uuid DEFAULT NEWSEQUENTIALID(),
    bon_id                      BIGINT NOT NULL,
    numero_sous_bon             INT NOT NULL,
    libelle                     NVARCHAR(255) NOT NULL,
    description                 NVARCHAR(MAX) NULL,
    montant                     DECIMAL(19,4) NOT NULL,
    montant_a_payer_client      DECIMAL(19,4) NULL,
    partenaire_id               BIGINT NOT NULL,
    numero_client               NVARCHAR(50)  NULL,
    numero_bl                   NVARCHAR(100) NOT NULL,
    code_manutention            NVARCHAR(100) NOT NULL,
    nature_comptable_id         BIGINT NULL,
    nature_operation_id         BIGINT NULL,
    cost_center_id              BIGINT NOT NULL,
    caisse_id                   BIGINT NOT NULL,
    portefeuille_id             BIGINT NOT NULL,
    devise_id                   BIGINT NOT NULL,
    statut                      NVARCHAR(20) NOT NULL CONSTRAINT DF_trx_sb_statut DEFAULT N'CREE',
    date_decaissement           DATETIME2(3) NULL,
    est_imprime                 BIT NOT NULL CONSTRAINT DF_trx_sb_imp DEFAULT 0,
    est_signe                   BIT NOT NULL CONSTRAINT DF_trx_sb_sig DEFAULT 0,
    created_at                  DATETIME2(3) NOT NULL CONSTRAINT DF_trx_sb_created DEFAULT SYSUTCDATETIME(),
    created_by_id               BIGINT NULL,
    updated_at                  DATETIME2(3) NULL,
    updated_by_id               BIGINT NULL,
    deleted_at                  DATETIME2(3) NULL,
    deleted_by_id               BIGINT NULL,
    version                     INT NOT NULL CONSTRAINT DF_trx_sb_version DEFAULT 1,
    CONSTRAINT PK_trx_sous_bon PRIMARY KEY CLUSTERED (id),
    CONSTRAINT UQ_trx_sous_bon_uuid UNIQUE (uuid),
    CONSTRAINT UQ_trx_sous_bon_bon_numero UNIQUE (bon_id, numero_sous_bon),
    CONSTRAINT CK_trx_sb_statut CHECK (statut IN
        (N'CREE', N'VALIDE', N'DECAISSE', N'COMPTABILISE', N'ANNULE', N'REFUSE')),
    CONSTRAINT CK_trx_sb_montant CHECK (montant > 0),
    CONSTRAINT CK_trx_sb_pay CHECK (montant_a_payer_client IS NULL OR montant_a_payer_client >= 0)
);
GO

/* -- trx_validation_bon ----------------------------------------------------- */
IF OBJECT_ID(N'dbo.trx_validation_bon', N'U') IS NULL
CREATE TABLE dbo.trx_validation_bon (
    id                          BIGINT IDENTITY(1,1) NOT NULL,
    bon_id                      BIGINT NULL,
    sous_bon_id                 BIGINT NULL,
    validateur_id               BIGINT NOT NULL,
    validateur_interim_id       BIGINT NULL,
    niveau_validation           INT NOT NULL CONSTRAINT DF_trx_vb_niveau DEFAULT 1,
    ordre                       INT NOT NULL CONSTRAINT DF_trx_vb_ordre DEFAULT 1,
    est_obligatoire             BIT NOT NULL CONSTRAINT DF_trx_vb_obl DEFAULT 1,
    action                      NVARCHAR(20) NOT NULL,
    date_validation             DATETIME2(3) NOT NULL CONSTRAINT DF_trx_vb_date DEFAULT SYSUTCDATETIME(),
    commentaire                 NVARCHAR(500) NULL,
    created_at                  DATETIME2(3) NOT NULL CONSTRAINT DF_trx_vb_created DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_trx_validation_bon PRIMARY KEY CLUSTERED (id),
    CONSTRAINT CK_trx_vb_action CHECK (action IN (N'VALIDE', N'REFUSE', N'SIGNE')),
    CONSTRAINT CK_trx_vb_target CHECK (
        (bon_id IS NOT NULL AND sous_bon_id IS NULL)
     OR (bon_id IS NULL AND sous_bon_id IS NOT NULL))
);
GO

/* -- trx_impression_bon ----------------------------------------------------- */
IF OBJECT_ID(N'dbo.trx_impression_bon', N'U') IS NULL
CREATE TABLE dbo.trx_impression_bon (
    id              BIGINT IDENTITY(1,1) NOT NULL,
    bon_id          BIGINT NULL,
    sous_bon_id     BIGINT NULL,
    imprime_par_id  BIGINT NOT NULL,
    date_impression DATETIME2(3) NOT NULL CONSTRAINT DF_trx_ib_date DEFAULT SYSUTCDATETIME(),
    a_signe         BIT NOT NULL CONSTRAINT DF_trx_ib_signe DEFAULT 0,
    date_signature  DATETIME2(3) NULL,
    signature_image NVARCHAR(MAX) NULL,
    created_at      DATETIME2(3) NOT NULL CONSTRAINT DF_trx_ib_created DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_trx_impression_bon PRIMARY KEY CLUSTERED (id),
    CONSTRAINT CK_trx_ib_target CHECK (bon_id IS NOT NULL OR sous_bon_id IS NOT NULL)
);
GO

-- Ajout idempotent de signature_image sur les bases déjà créées (avant cette colonne).
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE Name = N'signature_image' AND Object_ID = OBJECT_ID(N'dbo.trx_impression_bon'))
BEGIN
    ALTER TABLE dbo.trx_impression_bon ADD signature_image NVARCHAR(MAX) NULL;
END
GO

/* -- trx_bon_caisse (duplication au decaissement) --------------------------- */
IF OBJECT_ID(N'dbo.trx_bon_caisse', N'U') IS NULL
CREATE TABLE dbo.trx_bon_caisse (
    id                      BIGINT IDENTITY(1,1) NOT NULL,
    uuid                    UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_trx_bc_uuid DEFAULT NEWSEQUENTIALID(),
    bon_source_id           BIGINT NULL,
    sous_bon_source_id      BIGINT NULL,
    caissier_id             BIGINT NOT NULL,
    date_duplication        DATETIME2(3) NOT NULL CONSTRAINT DF_trx_bc_dup DEFAULT SYSUTCDATETIME(),
    contenu_modifie         NVARCHAR(MAX) NULL,
    beneficiaire            NVARCHAR(255) NULL,
    statut                  NVARCHAR(20) NOT NULL CONSTRAINT DF_trx_bc_statut DEFAULT N'CREE',
    created_at              DATETIME2(3) NOT NULL CONSTRAINT DF_trx_bc_created DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_trx_bon_caisse PRIMARY KEY CLUSTERED (id),
    CONSTRAINT UQ_trx_bon_caisse_uuid UNIQUE (uuid),
    CONSTRAINT CK_trx_bc_target CHECK (bon_source_id IS NOT NULL OR sous_bon_source_id IS NOT NULL),
    CONSTRAINT CK_trx_bc_json CHECK (contenu_modifie IS NULL OR ISJSON(contenu_modifie) = 1)
);
GO

/* -- trx_decaissement ------------------------------------------------------- */
IF OBJECT_ID(N'dbo.trx_decaissement', N'U') IS NULL
CREATE TABLE dbo.trx_decaissement (
    id                      BIGINT IDENTITY(1,1) NOT NULL,
    bon_caisse_id           BIGINT NOT NULL,
    caissier_id             BIGINT NOT NULL,
    beneficiaire_nom        NVARCHAR(255) NOT NULL,
    beneficiaire_piece      NVARCHAR(100) NULL,
    beneficiaire_telephone  NVARCHAR(30)  NULL,
    montant                 DECIMAL(19,4) NOT NULL,
    date_decaissement       DATETIME2(3) NOT NULL CONSTRAINT DF_trx_d_date DEFAULT SYSUTCDATETIME(),
    portefeuille_id         BIGINT NOT NULL,
    created_at              DATETIME2(3) NOT NULL CONSTRAINT DF_trx_d_created DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_trx_decaissement PRIMARY KEY CLUSTERED (id),
    CONSTRAINT CK_trx_d_montant CHECK (montant > 0)
);
GO

/* -- trx_operation ---------------------------------------------------------- */
IF OBJECT_ID(N'dbo.trx_operation', N'U') IS NULL
CREATE TABLE dbo.trx_operation (
    id                  BIGINT IDENTITY(1,1) NOT NULL,
    transaction_uuid    UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_trx_op_uuid DEFAULT NEWSEQUENTIALID(),
    type_operation      NVARCHAR(20) NOT NULL,
    caisse_id           BIGINT NULL,
    portefeuille_id     BIGINT NULL,
    montant             DECIMAL(19,4) NOT NULL,
    devise_id           BIGINT NOT NULL,
    date_operation      DATETIME2(3) NOT NULL CONSTRAINT DF_trx_op_date DEFAULT SYSUTCDATETIME(),
    user_id             BIGINT NOT NULL,
    reference           NVARCHAR(100) NULL,
    created_at          DATETIME2(3) NOT NULL CONSTRAINT DF_trx_op_created DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_trx_operation PRIMARY KEY CLUSTERED (id),
    CONSTRAINT CK_trx_op_type CHECK (type_operation IN
        (N'RECHARGE', N'DECAISSEMENT', N'TRANSFERT', N'AJUSTEMENT')),
    CONSTRAINT CK_trx_op_target CHECK (caisse_id IS NOT NULL OR portefeuille_id IS NOT NULL)
);
GO

/* -- trx_transfert ---------------------------------------------------------- */
IF OBJECT_ID(N'dbo.trx_transfert', N'U') IS NULL
CREATE TABLE dbo.trx_transfert (
    id                      BIGINT IDENTITY(1,1) NOT NULL,
    caisse_source_id        BIGINT NOT NULL,
    caisse_cible_id         BIGINT NULL,
    portefeuille_cible_id   BIGINT NULL,
    montant_source          DECIMAL(19,4) NOT NULL,
    montant_cible           DECIMAL(19,4) NOT NULL,
    devise_source_id        BIGINT NOT NULL,
    devise_cible_id         BIGINT NOT NULL,
    taux_applique           DECIMAL(19,8) NOT NULL,
    montant_gain            DECIMAL(19,4) NOT NULL CONSTRAINT DF_trx_t_gain DEFAULT 0,
    montant_perte           DECIMAL(19,4) NOT NULL CONSTRAINT DF_trx_t_perte DEFAULT 0,
    date_transfert          DATETIME2(3) NOT NULL CONSTRAINT DF_trx_t_date DEFAULT SYSUTCDATETIME(),
    initiateur_id           BIGINT NOT NULL,
    statut                  NVARCHAR(30) NOT NULL CONSTRAINT DF_trx_t_statut DEFAULT N'INITIE',
    created_at              DATETIME2(3) NOT NULL CONSTRAINT DF_trx_t_created DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_trx_transfert PRIMARY KEY CLUSTERED (id),
    CONSTRAINT CK_trx_t_statut CHECK (statut IN
        (N'INITIE', N'DEBIT_SOURCE_OK', N'CREDIT_CIBLE_OK',
         N'ECRITURE_CHANGE_OK', N'TERMINE', N'COMPENSATION', N'ANNULE')),
    CONSTRAINT CK_trx_t_target CHECK (caisse_cible_id IS NOT NULL OR portefeuille_cible_id IS NOT NULL),
    CONSTRAINT CK_trx_t_montants CHECK (montant_source > 0 AND montant_cible > 0),
    CONSTRAINT CK_trx_t_gain_perte CHECK (montant_gain >= 0 AND montant_perte >= 0)
);
GO

/* -- trx_ecriture_comptable (partie double immuable) ------------------------ */
IF OBJECT_ID(N'dbo.trx_ecriture_comptable', N'U') IS NULL
CREATE TABLE dbo.trx_ecriture_comptable (
    id                      BIGINT IDENTITY(1,1) NOT NULL,
    transaction_uuid        UNIQUEIDENTIFIER NOT NULL,
    compte_id               BIGINT NOT NULL,
    type_compte             NVARCHAR(20) NOT NULL,
    plan_comptable_id       BIGINT NULL,
    cost_center_id          BIGINT NULL,
    debit                   DECIMAL(19,4) NULL,
    credit                  DECIMAL(19,4) NULL,
    devise_id               BIGINT NOT NULL,
    reference_bon_id        BIGINT NULL,
    reference_sous_bon_id   BIGINT NULL,
    date_ecriture           DATETIME2(3) NOT NULL CONSTRAINT DF_trx_ec_date DEFAULT SYSUTCDATETIME(),
    hash_integrite          NVARCHAR(64)  NOT NULL,
    hash_precedent          NVARCHAR(64)  NULL,
    created_at              DATETIME2(3) NOT NULL CONSTRAINT DF_trx_ec_created DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_trx_ecriture_comptable PRIMARY KEY CLUSTERED (id),
    CONSTRAINT CK_trx_ec_type CHECK (type_compte IN
        (N'CAISSE', N'PORTEFEUILLE', N'GAIN_CHANGE', N'PERTE_CHANGE', N'CHARGE')),
    CONSTRAINT CK_trx_ec_dc CHECK (
        (debit IS NOT NULL AND credit IS NULL AND debit > 0)
     OR (debit IS NULL AND credit IS NOT NULL AND credit > 0))
);
GO


/* ============================================================================
   6. DOMAINE AUDIT & INTEGRATION (aud_) - 9 tables
   ============================================================================ */

/* -- aud_journal (append-only) ---------------------------------------------- */
IF OBJECT_ID(N'dbo.aud_journal', N'U') IS NULL
CREATE TABLE dbo.aud_journal (
    id                  BIGINT IDENTITY(1,1) NOT NULL,
    user_id             BIGINT NULL,
    action              NVARCHAR(100) NOT NULL,
    entite_concernee    NVARCHAR(100) NOT NULL,
    entite_id           BIGINT NULL,
    ancienne_valeur     NVARCHAR(MAX) NULL,
    nouvelle_valeur     NVARCHAR(MAX) NULL,
    date_action         DATETIME2(3) NOT NULL CONSTRAINT DF_aud_journal_date DEFAULT SYSUTCDATETIME(),
    adresse_ip          NVARCHAR(45)  NULL,
    user_agent          NVARCHAR(500) NULL,
    CONSTRAINT PK_aud_journal PRIMARY KEY CLUSTERED (id),
    CONSTRAINT CK_aud_journal_anc_json CHECK (ancienne_valeur IS NULL OR ISJSON(ancienne_valeur) = 1),
    CONSTRAINT CK_aud_journal_nv_json  CHECK (nouvelle_valeur IS NULL OR ISJSON(nouvelle_valeur) = 1)
);
GO

/* -- aud_evenement_bon (event sourcing) ------------------------------------- */
IF OBJECT_ID(N'dbo.aud_evenement_bon', N'U') IS NULL
CREATE TABLE dbo.aud_evenement_bon (
    id                  BIGINT IDENTITY(1,1) NOT NULL,
    bon_id              BIGINT NULL,
    sous_bon_id         BIGINT NULL,
    type_evenement      NVARCHAR(30) NOT NULL,
    acteur_id           BIGINT NOT NULL,
    acteur_interim_id   BIGINT NULL,
    payload             NVARCHAR(MAX) NULL,
    date_evenement      DATETIME2(3) NOT NULL CONSTRAINT DF_aud_eb_date DEFAULT SYSUTCDATETIME(),
    adresse_ip          NVARCHAR(45) NULL,
    CONSTRAINT PK_aud_evenement_bon PRIMARY KEY CLUSTERED (id),
    CONSTRAINT CK_aud_eb_type CHECK (type_evenement IN
        (N'CREE', N'MODIFIE', N'VALIDE', N'SIGNE', N'IMPRIME', N'DECAISSE', N'ANNULE', N'REFUSE')),
    CONSTRAINT CK_aud_eb_target CHECK (bon_id IS NOT NULL OR sous_bon_id IS NOT NULL),
    CONSTRAINT CK_aud_eb_json CHECK (payload IS NULL OR ISJSON(payload) = 1)
);
GO

/* -- aud_outbox (pattern Outbox) -------------------------------------------- */
IF OBJECT_ID(N'dbo.aud_outbox', N'U') IS NULL
CREATE TABLE dbo.aud_outbox (
    id                          BIGINT IDENTITY(1,1) NOT NULL,
    type_message                NVARCHAR(50) NOT NULL,
    payload                     NVARCHAR(MAX) NOT NULL,
    statut                      NVARCHAR(20) NOT NULL CONSTRAINT DF_aud_ox_statut DEFAULT N'EN_ATTENTE',
    nb_tentatives               INT NOT NULL CONSTRAINT DF_aud_ox_nb DEFAULT 0,
    prochaine_tentative         DATETIME2(3) NULL,
    derniere_erreur             NVARCHAR(MAX) NULL,
    cle_idempotence_externe     NVARCHAR(100) NULL,
    date_creation               DATETIME2(3) NOT NULL CONSTRAINT DF_aud_ox_created DEFAULT SYSUTCDATETIME(),
    date_traitement             DATETIME2(3) NULL,
    CONSTRAINT PK_aud_outbox PRIMARY KEY CLUSTERED (id),
    CONSTRAINT CK_aud_ox_statut CHECK (statut IN
        (N'EN_ATTENTE', N'EN_COURS', N'ENVOYE', N'ECHEC')),
    CONSTRAINT CK_aud_ox_json CHECK (ISJSON(payload) = 1)
);
GO

/* -- aud_log_sap ------------------------------------------------------------ */
IF OBJECT_ID(N'dbo.aud_log_sap', N'U') IS NULL
CREATE TABLE dbo.aud_log_sap (
    id                  BIGINT IDENTITY(1,1) NOT NULL,
    session_caisse_id   BIGINT NULL,
    outbox_id           BIGINT NULL,
    date_envoi          DATETIME2(3) NOT NULL CONSTRAINT DF_aud_ls_date DEFAULT SYSUTCDATETIME(),
    payload             NVARCHAR(MAX) NULL,
    statut              NVARCHAR(20) NOT NULL,
    message_retour      NVARCHAR(MAX) NULL,
    nb_tentatives       INT NOT NULL CONSTRAINT DF_aud_ls_nb DEFAULT 1,
    CONSTRAINT PK_aud_log_sap PRIMARY KEY CLUSTERED (id),
    CONSTRAINT CK_aud_ls_statut CHECK (statut IN (N'SUCCES', N'ECHEC')),
    CONSTRAINT CK_aud_ls_json CHECK (payload IS NULL OR ISJSON(payload) = 1)
);
GO

/* -- aud_idempotency_key ---------------------------------------------------- */
IF OBJECT_ID(N'dbo.aud_idempotency_key', N'U') IS NULL
CREATE TABLE dbo.aud_idempotency_key (
    cle             UNIQUEIDENTIFIER NOT NULL,
    user_id         BIGINT NOT NULL,
    endpoint        NVARCHAR(255) NOT NULL,
    hash_requete    NVARCHAR(64) NOT NULL,
    reponse_cachee  NVARCHAR(MAX) NULL,
    statut          NVARCHAR(20) NOT NULL CONSTRAINT DF_aud_ik_statut DEFAULT N'EN_COURS',
    expire_le       DATETIME2(3) NOT NULL,
    created_at      DATETIME2(3) NOT NULL CONSTRAINT DF_aud_ik_created DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_aud_idempotency_key PRIMARY KEY CLUSTERED (cle),
    CONSTRAINT CK_aud_ik_statut CHECK (statut IN (N'EN_COURS', N'TERMINE', N'ECHEC')),
    CONSTRAINT CK_aud_ik_json CHECK (reponse_cachee IS NULL OR ISJSON(reponse_cachee) = 1)
);
GO

/* -- aud_snapshot_journalier ------------------------------------------------ */
IF OBJECT_ID(N'dbo.aud_snapshot_journalier', N'U') IS NULL
CREATE TABLE dbo.aud_snapshot_journalier (
    id                          BIGINT IDENTITY(1,1) NOT NULL,
    date_snapshot               DATE NOT NULL,
    caisse_id                   BIGINT NOT NULL,
    solde_calcule_ecritures     DECIMAL(19,4) NOT NULL,
    solde_caisse_table          DECIMAL(19,4) NOT NULL,
    solde_sap                   DECIMAL(19,4) NULL,
    ecart                       DECIMAL(19,4) NOT NULL CONSTRAINT DF_aud_sj_ecart DEFAULT 0,
    statut_reconciliation       NVARCHAR(20) NOT NULL,
    created_at                  DATETIME2(3) NOT NULL CONSTRAINT DF_aud_sj_created DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_aud_snapshot_journalier PRIMARY KEY CLUSTERED (id),
    CONSTRAINT UQ_aud_sj_date_caisse UNIQUE (date_snapshot, caisse_id),
    CONSTRAINT CK_aud_sj_statut CHECK (statut_reconciliation IN
        (N'CONFORME', N'ECART_FAIBLE', N'ECART_CRITIQUE', N'NON_RECONCILIE'))
);
GO

/* -- aud_planification_recurrence ------------------------------------------- */
IF OBJECT_ID(N'dbo.aud_planification_recurrence', N'U') IS NULL
CREATE TABLE dbo.aud_planification_recurrence (
    id                              BIGINT IDENTITY(1,1) NOT NULL,
    bon_id                          BIGINT NOT NULL,
    frequence                       NVARCHAR(20) NOT NULL,
    derniere_execution              DATETIME2(3) NULL,
    prochaine_execution             DATETIME2(3) NOT NULL,
    est_actif                       BIT NOT NULL CONSTRAINT DF_aud_pr_actif DEFAULT 1,
    nb_renouvellements_effectues    INT NOT NULL CONSTRAINT DF_aud_pr_nb DEFAULT 0,
    created_at                      DATETIME2(3) NOT NULL CONSTRAINT DF_aud_pr_created DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_aud_planification_recurrence PRIMARY KEY CLUSTERED (id),
    CONSTRAINT CK_aud_pr_freq CHECK (frequence IN
        (N'MENSUEL', N'TRIMESTRIEL', N'SEMESTRIEL', N'ANNUEL'))
);
GO

/* -- aud_changement_permission (append-only) -------------------------------- */
IF OBJECT_ID(N'dbo.aud_changement_permission', N'U') IS NULL
CREATE TABLE dbo.aud_changement_permission (
    id                  BIGINT IDENTITY(1,1) NOT NULL,
    user_concerne_id    BIGINT NOT NULL,
    permission_id       BIGINT NOT NULL,
    type_action         NVARCHAR(10) NOT NULL,
    source              NVARCHAR(20) NOT NULL,
    source_id           BIGINT NULL,
    acteur_id           BIGINT NOT NULL,
    date_action         DATETIME2(3) NOT NULL CONSTRAINT DF_aud_cp_date DEFAULT SYSUTCDATETIME(),
    adresse_ip          NVARCHAR(45) NULL,
    motif               NVARCHAR(500) NULL,
    CONSTRAINT PK_aud_changement_permission PRIMARY KEY CLUSTERED (id),
    CONSTRAINT CK_aud_cp_action CHECK (type_action IN (N'GAIN', N'PERTE')),
    CONSTRAINT CK_aud_cp_source CHECK (source IN (N'ROLE', N'PROFIL', N'EXTRA', N'INTERIM'))
);
GO

/* -- aud_notification ------------------------------------------------------- */
IF OBJECT_ID(N'dbo.aud_notification', N'U') IS NULL
CREATE TABLE dbo.aud_notification (
    id                  BIGINT IDENTITY(1,1) NOT NULL,
    destinataire_id     BIGINT NOT NULL,
    type_notification   NVARCHAR(30) NOT NULL,
    entite_concernee    NVARCHAR(50) NULL,
    entite_id           BIGINT NULL,
    titre               NVARCHAR(200) NOT NULL,
    message             NVARCHAR(MAX) NOT NULL,
    canal               NVARCHAR(20) NOT NULL CONSTRAINT DF_aud_n_canal DEFAULT N'IN_APP',
    est_lue             BIT NOT NULL CONSTRAINT DF_aud_n_lue DEFAULT 0,
    date_lecture        DATETIME2(3) NULL,
    date_creation       DATETIME2(3) NOT NULL CONSTRAINT DF_aud_n_created DEFAULT SYSUTCDATETIME(),
    date_envoi          DATETIME2(3) NULL,
    CONSTRAINT PK_aud_notification PRIMARY KEY CLUSTERED (id),
    CONSTRAINT CK_aud_n_type CHECK (type_notification IN
        (N'BON_A_VALIDER', N'BON_VALIDE', N'BON_REFUSE', N'BON_DECAISSE',
         N'INTERIM_OUVERT', N'INTERIM_FERME', N'PERMISSION_ACCORDEE', N'SYSTEME')),
    CONSTRAINT CK_aud_n_canal CHECK (canal IN (N'PUSH', N'EMAIL', N'IN_APP'))
);
GO


/* ============================================================================
   7. CLES ETRANGERES (FK)
   ============================================================================ */

/* -- SEC ---------------------------------------------------------------------*/
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_sec_user_direction')
    ALTER TABLE dbo.sec_user ADD CONSTRAINT FK_sec_user_direction
        FOREIGN KEY (direction_id) REFERENCES dbo.sec_direction(id);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_sec_user_cost_center')
    ALTER TABLE dbo.sec_user ADD CONSTRAINT FK_sec_user_cost_center
        FOREIGN KEY (cost_center_id) REFERENCES dbo.ref_cost_center(id);

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_sec_user_role_user')
    ALTER TABLE dbo.sec_user_role ADD CONSTRAINT FK_sec_user_role_user
        FOREIGN KEY (user_id) REFERENCES dbo.sec_user(id);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_sec_user_role_role')
    ALTER TABLE dbo.sec_user_role ADD CONSTRAINT FK_sec_user_role_role
        FOREIGN KEY (role_id) REFERENCES dbo.sec_role(id);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_sec_user_role_attribue')
    ALTER TABLE dbo.sec_user_role ADD CONSTRAINT FK_sec_user_role_attribue
        FOREIGN KEY (attribue_par_id) REFERENCES dbo.sec_user(id);

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_sec_role_perm_role')
    ALTER TABLE dbo.sec_role_permission ADD CONSTRAINT FK_sec_role_perm_role
        FOREIGN KEY (role_id) REFERENCES dbo.sec_role(id);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_sec_role_perm_perm')
    ALTER TABLE dbo.sec_role_permission ADD CONSTRAINT FK_sec_role_perm_perm
        FOREIGN KEY (permission_id) REFERENCES dbo.sec_permission(id);

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_sec_user_profil_user')
    ALTER TABLE dbo.sec_user_profil ADD CONSTRAINT FK_sec_user_profil_user
        FOREIGN KEY (user_id) REFERENCES dbo.sec_user(id);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_sec_user_profil_profil')
    ALTER TABLE dbo.sec_user_profil ADD CONSTRAINT FK_sec_user_profil_profil
        FOREIGN KEY (profil_id) REFERENCES dbo.sec_profil(id);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_sec_user_profil_attribue')
    ALTER TABLE dbo.sec_user_profil ADD CONSTRAINT FK_sec_user_profil_attribue
        FOREIGN KEY (attribue_par_id) REFERENCES dbo.sec_user(id);

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_sec_profil_perm_profil')
    ALTER TABLE dbo.sec_profil_permission ADD CONSTRAINT FK_sec_profil_perm_profil
        FOREIGN KEY (profil_id) REFERENCES dbo.sec_profil(id);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_sec_profil_perm_perm')
    ALTER TABLE dbo.sec_profil_permission ADD CONSTRAINT FK_sec_profil_perm_perm
        FOREIGN KEY (permission_id) REFERENCES dbo.sec_permission(id);

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_sec_uca_user')
    ALTER TABLE dbo.sec_user_caisse_access ADD CONSTRAINT FK_sec_uca_user
        FOREIGN KEY (user_id) REFERENCES dbo.sec_user(id);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_sec_uca_caisse')
    ALTER TABLE dbo.sec_user_caisse_access ADD CONSTRAINT FK_sec_uca_caisse
        FOREIGN KEY (caisse_id) REFERENCES dbo.fin_caisse(id);

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_sec_ucc_user')
    ALTER TABLE dbo.sec_user_cost_center ADD CONSTRAINT FK_sec_ucc_user
        FOREIGN KEY (user_id) REFERENCES dbo.sec_user(id);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_sec_ucc_cc')
    ALTER TABLE dbo.sec_user_cost_center ADD CONSTRAINT FK_sec_ucc_cc
        FOREIGN KEY (cost_center_id) REFERENCES dbo.ref_cost_center(id);

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_sec_upe_user')
    ALTER TABLE dbo.sec_user_permission_extra ADD CONSTRAINT FK_sec_upe_user
        FOREIGN KEY (user_id) REFERENCES dbo.sec_user(id);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_sec_upe_perm')
    ALTER TABLE dbo.sec_user_permission_extra ADD CONSTRAINT FK_sec_upe_perm
        FOREIGN KEY (permission_id) REFERENCES dbo.sec_permission(id);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_sec_upe_acc')
    ALTER TABLE dbo.sec_user_permission_extra ADD CONSTRAINT FK_sec_upe_acc
        FOREIGN KEY (accorde_par_id) REFERENCES dbo.sec_user(id);

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_sec_interim_init')
    ALTER TABLE dbo.sec_interim ADD CONSTRAINT FK_sec_interim_init
        FOREIGN KEY (initiateur_id) REFERENCES dbo.sec_user(id);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_sec_interim_rempl')
    ALTER TABLE dbo.sec_interim ADD CONSTRAINT FK_sec_interim_rempl
        FOREIGN KEY (remplacant_id) REFERENCES dbo.sec_user(id);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_sec_interim_perm')
    ALTER TABLE dbo.sec_interim ADD CONSTRAINT FK_sec_interim_perm
        FOREIGN KEY (permission_id) REFERENCES dbo.sec_permission(id);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_sec_interim_role')
    ALTER TABLE dbo.sec_interim ADD CONSTRAINT FK_sec_interim_role
        FOREIGN KEY (role_transferre_id) REFERENCES dbo.sec_role(id);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_sec_interim_profil')
    ALTER TABLE dbo.sec_interim ADD CONSTRAINT FK_sec_interim_profil
        FOREIGN KEY (profil_transferre_id) REFERENCES dbo.sec_profil(id);
GO

/* -- REF ---------------------------------------------------------------------*/
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_ref_pc_parent')
    ALTER TABLE dbo.ref_plan_comptable ADD CONSTRAINT FK_ref_pc_parent
        FOREIGN KEY (parent_id) REFERENCES dbo.ref_plan_comptable(id);

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_ref_cc_direction')
    ALTER TABLE dbo.ref_cost_center ADD CONSTRAINT FK_ref_cc_direction
        FOREIGN KEY (direction_id) REFERENCES dbo.sec_direction(id);

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_ref_no_cc')
    ALTER TABLE dbo.ref_nature_operation ADD CONSTRAINT FK_ref_no_cc
        FOREIGN KEY (cost_center_id) REFERENCES dbo.ref_cost_center(id);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_ref_no_pc')
    ALTER TABLE dbo.ref_nature_operation ADD CONSTRAINT FK_ref_no_pc
        FOREIGN KEY (plan_comptable_id) REFERENCES dbo.ref_plan_comptable(id);

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_ref_nc_cc')
    ALTER TABLE dbo.ref_nature_comptable ADD CONSTRAINT FK_ref_nc_cc
        FOREIGN KEY (cost_center_id) REFERENCES dbo.ref_cost_center(id);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_ref_nc_pc')
    ALTER TABLE dbo.ref_nature_comptable ADD CONSTRAINT FK_ref_nc_pc
        FOREIGN KEY (plan_comptable_id) REFERENCES dbo.ref_plan_comptable(id);

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_ref_pnc_partenaire')
    ALTER TABLE dbo.ref_partenaire_nature_comptable ADD CONSTRAINT FK_ref_pnc_partenaire
        FOREIGN KEY (partenaire_id) REFERENCES dbo.ref_partenaire(id);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_ref_pnc_nc')
    ALTER TABLE dbo.ref_partenaire_nature_comptable ADD CONSTRAINT FK_ref_pnc_nc
        FOREIGN KEY (nature_comptable_id) REFERENCES dbo.ref_nature_comptable(id);

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_ref_site_direction')
    ALTER TABLE dbo.ref_site ADD CONSTRAINT FK_ref_site_direction
        FOREIGN KEY (direction_id) REFERENCES dbo.sec_direction(id);
GO

/* -- FIN ---------------------------------------------------------------------*/
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_fin_te_source')
    ALTER TABLE dbo.fin_taux_echange ADD CONSTRAINT FK_fin_te_source
        FOREIGN KEY (devise_source_id) REFERENCES dbo.fin_devise(id);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_fin_te_cible')
    ALTER TABLE dbo.fin_taux_echange ADD CONSTRAINT FK_fin_te_cible
        FOREIGN KEY (devise_cible_id) REFERENCES dbo.fin_devise(id);

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_fin_caisse_devise')
    ALTER TABLE dbo.fin_caisse ADD CONSTRAINT FK_fin_caisse_devise
        FOREIGN KEY (devise_id) REFERENCES dbo.fin_devise(id);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_fin_caisse_caissier')
    ALTER TABLE dbo.fin_caisse ADD CONSTRAINT FK_fin_caisse_caissier
        FOREIGN KEY (caissier_id) REFERENCES dbo.sec_user(id);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_fin_caisse_site')
    ALTER TABLE dbo.fin_caisse ADD CONSTRAINT FK_fin_caisse_site
        FOREIGN KEY (site_id) REFERENCES dbo.ref_site(id);

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_fin_sc_caisse')
    ALTER TABLE dbo.fin_session_caisse ADD CONSTRAINT FK_fin_sc_caisse
        FOREIGN KEY (caisse_id) REFERENCES dbo.fin_caisse(id);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_fin_sc_cloture')
    ALTER TABLE dbo.fin_session_caisse ADD CONSTRAINT FK_fin_sc_cloture
        FOREIGN KEY (cloture_par_id) REFERENCES dbo.sec_user(id);

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_fin_pf_caisse')
    ALTER TABLE dbo.fin_portefeuille ADD CONSTRAINT FK_fin_pf_caisse
        FOREIGN KEY (caisse_source_id) REFERENCES dbo.fin_caisse(id);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_fin_pf_devise')
    ALTER TABLE dbo.fin_portefeuille ADD CONSTRAINT FK_fin_pf_devise
        FOREIGN KEY (devise_id) REFERENCES dbo.fin_devise(id);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_fin_pf_site')
    ALTER TABLE dbo.fin_portefeuille ADD CONSTRAINT FK_fin_pf_site
        FOREIGN KEY (site_id) REFERENCES dbo.ref_site(id);

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_fin_cgc_devise')
    ALTER TABLE dbo.fin_compte_gain_change ADD CONSTRAINT FK_fin_cgc_devise
        FOREIGN KEY (devise_id) REFERENCES dbo.fin_devise(id);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_fin_cpc_devise')
    ALTER TABLE dbo.fin_compte_perte_change ADD CONSTRAINT FK_fin_cpc_devise
        FOREIGN KEY (devise_id) REFERENCES dbo.fin_devise(id);
GO

/* -- TRX ---------------------------------------------------------------------*/
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_trx_bon_demandeur')
    ALTER TABLE dbo.trx_bon ADD CONSTRAINT FK_trx_bon_demandeur
        FOREIGN KEY (demandeur_id) REFERENCES dbo.sec_user(id);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_trx_bon_interim')
    ALTER TABLE dbo.trx_bon ADD CONSTRAINT FK_trx_bon_interim
        FOREIGN KEY (cree_par_interim_id) REFERENCES dbo.sec_user(id);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_trx_bon_type')
    ALTER TABLE dbo.trx_bon ADD CONSTRAINT FK_trx_bon_type
        FOREIGN KEY (type_bon_id) REFERENCES dbo.ref_type_bon(id);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_trx_bon_parent')
    ALTER TABLE dbo.trx_bon ADD CONSTRAINT FK_trx_bon_parent
        FOREIGN KEY (bon_parent_id) REFERENCES dbo.trx_bon(id);

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_trx_sb_bon')
    ALTER TABLE dbo.trx_sous_bon ADD CONSTRAINT FK_trx_sb_bon
        FOREIGN KEY (bon_id) REFERENCES dbo.trx_bon(id);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_trx_sb_partenaire')
    ALTER TABLE dbo.trx_sous_bon ADD CONSTRAINT FK_trx_sb_partenaire
        FOREIGN KEY (partenaire_id) REFERENCES dbo.ref_partenaire(id);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_trx_sb_nc')
    ALTER TABLE dbo.trx_sous_bon ADD CONSTRAINT FK_trx_sb_nc
        FOREIGN KEY (nature_comptable_id) REFERENCES dbo.ref_nature_comptable(id);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_trx_sb_no')
    ALTER TABLE dbo.trx_sous_bon ADD CONSTRAINT FK_trx_sb_no
        FOREIGN KEY (nature_operation_id) REFERENCES dbo.ref_nature_operation(id);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_trx_sb_cc')
    ALTER TABLE dbo.trx_sous_bon ADD CONSTRAINT FK_trx_sb_cc
        FOREIGN KEY (cost_center_id) REFERENCES dbo.ref_cost_center(id);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_trx_sb_caisse')
    ALTER TABLE dbo.trx_sous_bon ADD CONSTRAINT FK_trx_sb_caisse
        FOREIGN KEY (caisse_id) REFERENCES dbo.fin_caisse(id);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_trx_sb_portefeuille')
    ALTER TABLE dbo.trx_sous_bon ADD CONSTRAINT FK_trx_sb_portefeuille
        FOREIGN KEY (portefeuille_id) REFERENCES dbo.fin_portefeuille(id);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_trx_sb_devise')
    ALTER TABLE dbo.trx_sous_bon ADD CONSTRAINT FK_trx_sb_devise
        FOREIGN KEY (devise_id) REFERENCES dbo.fin_devise(id);

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_trx_vb_bon')
    ALTER TABLE dbo.trx_validation_bon ADD CONSTRAINT FK_trx_vb_bon
        FOREIGN KEY (bon_id) REFERENCES dbo.trx_bon(id);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_trx_vb_sb')
    ALTER TABLE dbo.trx_validation_bon ADD CONSTRAINT FK_trx_vb_sb
        FOREIGN KEY (sous_bon_id) REFERENCES dbo.trx_sous_bon(id);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_trx_vb_validateur')
    ALTER TABLE dbo.trx_validation_bon ADD CONSTRAINT FK_trx_vb_validateur
        FOREIGN KEY (validateur_id) REFERENCES dbo.sec_user(id);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_trx_vb_interim')
    ALTER TABLE dbo.trx_validation_bon ADD CONSTRAINT FK_trx_vb_interim
        FOREIGN KEY (validateur_interim_id) REFERENCES dbo.sec_user(id);

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_trx_ib_bon')
    ALTER TABLE dbo.trx_impression_bon ADD CONSTRAINT FK_trx_ib_bon
        FOREIGN KEY (bon_id) REFERENCES dbo.trx_bon(id);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_trx_ib_sb')
    ALTER TABLE dbo.trx_impression_bon ADD CONSTRAINT FK_trx_ib_sb
        FOREIGN KEY (sous_bon_id) REFERENCES dbo.trx_sous_bon(id);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_trx_ib_user')
    ALTER TABLE dbo.trx_impression_bon ADD CONSTRAINT FK_trx_ib_user
        FOREIGN KEY (imprime_par_id) REFERENCES dbo.sec_user(id);

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_trx_bc_bon')
    ALTER TABLE dbo.trx_bon_caisse ADD CONSTRAINT FK_trx_bc_bon
        FOREIGN KEY (bon_source_id) REFERENCES dbo.trx_bon(id);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_trx_bc_sb')
    ALTER TABLE dbo.trx_bon_caisse ADD CONSTRAINT FK_trx_bc_sb
        FOREIGN KEY (sous_bon_source_id) REFERENCES dbo.trx_sous_bon(id);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_trx_bc_caissier')
    ALTER TABLE dbo.trx_bon_caisse ADD CONSTRAINT FK_trx_bc_caissier
        FOREIGN KEY (caissier_id) REFERENCES dbo.sec_user(id);

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_trx_d_bc')
    ALTER TABLE dbo.trx_decaissement ADD CONSTRAINT FK_trx_d_bc
        FOREIGN KEY (bon_caisse_id) REFERENCES dbo.trx_bon_caisse(id);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_trx_d_caissier')
    ALTER TABLE dbo.trx_decaissement ADD CONSTRAINT FK_trx_d_caissier
        FOREIGN KEY (caissier_id) REFERENCES dbo.sec_user(id);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_trx_d_pf')
    ALTER TABLE dbo.trx_decaissement ADD CONSTRAINT FK_trx_d_pf
        FOREIGN KEY (portefeuille_id) REFERENCES dbo.fin_portefeuille(id);

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_trx_op_caisse')
    ALTER TABLE dbo.trx_operation ADD CONSTRAINT FK_trx_op_caisse
        FOREIGN KEY (caisse_id) REFERENCES dbo.fin_caisse(id);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_trx_op_pf')
    ALTER TABLE dbo.trx_operation ADD CONSTRAINT FK_trx_op_pf
        FOREIGN KEY (portefeuille_id) REFERENCES dbo.fin_portefeuille(id);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_trx_op_devise')
    ALTER TABLE dbo.trx_operation ADD CONSTRAINT FK_trx_op_devise
        FOREIGN KEY (devise_id) REFERENCES dbo.fin_devise(id);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_trx_op_user')
    ALTER TABLE dbo.trx_operation ADD CONSTRAINT FK_trx_op_user
        FOREIGN KEY (user_id) REFERENCES dbo.sec_user(id);

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_trx_t_cs')
    ALTER TABLE dbo.trx_transfert ADD CONSTRAINT FK_trx_t_cs
        FOREIGN KEY (caisse_source_id) REFERENCES dbo.fin_caisse(id);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_trx_t_cc')
    ALTER TABLE dbo.trx_transfert ADD CONSTRAINT FK_trx_t_cc
        FOREIGN KEY (caisse_cible_id) REFERENCES dbo.fin_caisse(id);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_trx_t_pc')
    ALTER TABLE dbo.trx_transfert ADD CONSTRAINT FK_trx_t_pc
        FOREIGN KEY (portefeuille_cible_id) REFERENCES dbo.fin_portefeuille(id);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_trx_t_ds')
    ALTER TABLE dbo.trx_transfert ADD CONSTRAINT FK_trx_t_ds
        FOREIGN KEY (devise_source_id) REFERENCES dbo.fin_devise(id);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_trx_t_dc')
    ALTER TABLE dbo.trx_transfert ADD CONSTRAINT FK_trx_t_dc
        FOREIGN KEY (devise_cible_id) REFERENCES dbo.fin_devise(id);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_trx_t_init')
    ALTER TABLE dbo.trx_transfert ADD CONSTRAINT FK_trx_t_init
        FOREIGN KEY (initiateur_id) REFERENCES dbo.sec_user(id);

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_trx_ec_pc')
    ALTER TABLE dbo.trx_ecriture_comptable ADD CONSTRAINT FK_trx_ec_pc
        FOREIGN KEY (plan_comptable_id) REFERENCES dbo.ref_plan_comptable(id);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_trx_ec_cc')
    ALTER TABLE dbo.trx_ecriture_comptable ADD CONSTRAINT FK_trx_ec_cc
        FOREIGN KEY (cost_center_id) REFERENCES dbo.ref_cost_center(id);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_trx_ec_devise')
    ALTER TABLE dbo.trx_ecriture_comptable ADD CONSTRAINT FK_trx_ec_devise
        FOREIGN KEY (devise_id) REFERENCES dbo.fin_devise(id);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_trx_ec_bon')
    ALTER TABLE dbo.trx_ecriture_comptable ADD CONSTRAINT FK_trx_ec_bon
        FOREIGN KEY (reference_bon_id) REFERENCES dbo.trx_bon(id);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_trx_ec_sb')
    ALTER TABLE dbo.trx_ecriture_comptable ADD CONSTRAINT FK_trx_ec_sb
        FOREIGN KEY (reference_sous_bon_id) REFERENCES dbo.trx_sous_bon(id);
GO

/* -- AUD ---------------------------------------------------------------------*/
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_aud_journal_user')
    ALTER TABLE dbo.aud_journal ADD CONSTRAINT FK_aud_journal_user
        FOREIGN KEY (user_id) REFERENCES dbo.sec_user(id);

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_aud_eb_bon')
    ALTER TABLE dbo.aud_evenement_bon ADD CONSTRAINT FK_aud_eb_bon
        FOREIGN KEY (bon_id) REFERENCES dbo.trx_bon(id);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_aud_eb_sb')
    ALTER TABLE dbo.aud_evenement_bon ADD CONSTRAINT FK_aud_eb_sb
        FOREIGN KEY (sous_bon_id) REFERENCES dbo.trx_sous_bon(id);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_aud_eb_acteur')
    ALTER TABLE dbo.aud_evenement_bon ADD CONSTRAINT FK_aud_eb_acteur
        FOREIGN KEY (acteur_id) REFERENCES dbo.sec_user(id);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_aud_eb_interim')
    ALTER TABLE dbo.aud_evenement_bon ADD CONSTRAINT FK_aud_eb_interim
        FOREIGN KEY (acteur_interim_id) REFERENCES dbo.sec_user(id);

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_aud_ls_session')
    ALTER TABLE dbo.aud_log_sap ADD CONSTRAINT FK_aud_ls_session
        FOREIGN KEY (session_caisse_id) REFERENCES dbo.fin_session_caisse(id);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_aud_ls_outbox')
    ALTER TABLE dbo.aud_log_sap ADD CONSTRAINT FK_aud_ls_outbox
        FOREIGN KEY (outbox_id) REFERENCES dbo.aud_outbox(id);

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_aud_ik_user')
    ALTER TABLE dbo.aud_idempotency_key ADD CONSTRAINT FK_aud_ik_user
        FOREIGN KEY (user_id) REFERENCES dbo.sec_user(id);

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_aud_sj_caisse')
    ALTER TABLE dbo.aud_snapshot_journalier ADD CONSTRAINT FK_aud_sj_caisse
        FOREIGN KEY (caisse_id) REFERENCES dbo.fin_caisse(id);

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_aud_pr_bon')
    ALTER TABLE dbo.aud_planification_recurrence ADD CONSTRAINT FK_aud_pr_bon
        FOREIGN KEY (bon_id) REFERENCES dbo.trx_bon(id);

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_aud_cp_user')
    ALTER TABLE dbo.aud_changement_permission ADD CONSTRAINT FK_aud_cp_user
        FOREIGN KEY (user_concerne_id) REFERENCES dbo.sec_user(id);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_aud_cp_perm')
    ALTER TABLE dbo.aud_changement_permission ADD CONSTRAINT FK_aud_cp_perm
        FOREIGN KEY (permission_id) REFERENCES dbo.sec_permission(id);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_aud_cp_acteur')
    ALTER TABLE dbo.aud_changement_permission ADD CONSTRAINT FK_aud_cp_acteur
        FOREIGN KEY (acteur_id) REFERENCES dbo.sec_user(id);

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_aud_n_user')
    ALTER TABLE dbo.aud_notification ADD CONSTRAINT FK_aud_n_user
        FOREIGN KEY (destinataire_id) REFERENCES dbo.sec_user(id);
GO


/* ============================================================================
   8. INDEX DE PERFORMANCE
   ============================================================================ */

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_sec_user_direction' AND object_id = OBJECT_ID(N'dbo.sec_user'))
    CREATE INDEX IX_sec_user_direction ON dbo.sec_user(direction_id) WHERE deleted_at IS NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_trx_bon_demandeur' AND object_id = OBJECT_ID(N'dbo.trx_bon'))
    CREATE INDEX IX_trx_bon_demandeur ON dbo.trx_bon(demandeur_id) WHERE deleted_at IS NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_trx_bon_statut' AND object_id = OBJECT_ID(N'dbo.trx_bon'))
    CREATE INDEX IX_trx_bon_statut ON dbo.trx_bon(statut, created_at DESC) WHERE deleted_at IS NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_trx_bon_type' AND object_id = OBJECT_ID(N'dbo.trx_bon'))
    CREATE INDEX IX_trx_bon_type ON dbo.trx_bon(type_bon_id);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_trx_sb_bon' AND object_id = OBJECT_ID(N'dbo.trx_sous_bon'))
    CREATE INDEX IX_trx_sb_bon ON dbo.trx_sous_bon(bon_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_trx_sb_partenaire' AND object_id = OBJECT_ID(N'dbo.trx_sous_bon'))
    CREATE INDEX IX_trx_sb_partenaire ON dbo.trx_sous_bon(partenaire_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_trx_sb_caisse' AND object_id = OBJECT_ID(N'dbo.trx_sous_bon'))
    CREATE INDEX IX_trx_sb_caisse ON dbo.trx_sous_bon(caisse_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_trx_sb_portefeuille' AND object_id = OBJECT_ID(N'dbo.trx_sous_bon'))
    CREATE INDEX IX_trx_sb_portefeuille ON dbo.trx_sous_bon(portefeuille_id);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_trx_ec_transaction' AND object_id = OBJECT_ID(N'dbo.trx_ecriture_comptable'))
    CREATE INDEX IX_trx_ec_transaction ON dbo.trx_ecriture_comptable(transaction_uuid);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_trx_ec_compte' AND object_id = OBJECT_ID(N'dbo.trx_ecriture_comptable'))
    CREATE INDEX IX_trx_ec_compte ON dbo.trx_ecriture_comptable(compte_id, type_compte, date_ecriture);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_aud_outbox_statut' AND object_id = OBJECT_ID(N'dbo.aud_outbox'))
    CREATE INDEX IX_aud_outbox_statut ON dbo.aud_outbox(statut, prochaine_tentative)
        WHERE statut IN (N'EN_ATTENTE', N'EN_COURS');

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_aud_notif_destinataire' AND object_id = OBJECT_ID(N'dbo.aud_notification'))
    CREATE INDEX IX_aud_notif_destinataire ON dbo.aud_notification(destinataire_id, est_lue, date_creation DESC);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_aud_ik_expire' AND object_id = OBJECT_ID(N'dbo.aud_idempotency_key'))
    CREATE INDEX IX_aud_ik_expire ON dbo.aud_idempotency_key(expire_le);
GO


/* ============================================================================
   9. SEED DATA - donnees de reference de base
   ============================================================================ */

/* -- Devises ---------------------------------------------------------------- */
IF NOT EXISTS (SELECT 1 FROM dbo.fin_devise WHERE code = N'XOF')
    INSERT INTO dbo.fin_devise(code, libelle, symbole, nb_decimales)
    VALUES (N'XOF', N'Franc CFA BCEAO', N'FCFA', 0);
IF NOT EXISTS (SELECT 1 FROM dbo.fin_devise WHERE code = N'EUR')
    INSERT INTO dbo.fin_devise(code, libelle, symbole, nb_decimales)
    VALUES (N'EUR', N'Euro', N'EUR', 2);
IF NOT EXISTS (SELECT 1 FROM dbo.fin_devise WHERE code = N'USD')
    INSERT INTO dbo.fin_devise(code, libelle, symbole, nb_decimales)
    VALUES (N'USD', N'Dollar US', N'USD', 2);
GO

/* -- Roles standardises ----------------------------------------------------- */
IF NOT EXISTS (SELECT 1 FROM dbo.sec_role WHERE code = N'SUPER_ADMIN')
    INSERT INTO dbo.sec_role(code, libelle, description, est_systeme)
    VALUES (N'SUPER_ADMIN', N'Super Administrateur', N'Toutes les autorisations', 1);
IF NOT EXISTS (SELECT 1 FROM dbo.sec_role WHERE code = N'ADMINISTRATEUR')
    INSERT INTO dbo.sec_role(code, libelle, description, est_systeme)
    VALUES (N'ADMINISTRATEUR', N'Administrateur', N'Utilisateur avec permissions configurables', 1);
IF NOT EXISTS (SELECT 1 FROM dbo.sec_role WHERE code = N'VALIDATEUR')
    INSERT INTO dbo.sec_role(code, libelle, description, est_systeme)
    VALUES (N'VALIDATEUR', N'Validateur', N'Valide les bons et sous-bons', 1);
IF NOT EXISTS (SELECT 1 FROM dbo.sec_role WHERE code = N'DEMANDEUR')
    INSERT INTO dbo.sec_role(code, libelle, description, est_systeme)
    VALUES (N'DEMANDEUR', N'Demandeur', N'Cree des demandes de bons', 1);
IF NOT EXISTS (SELECT 1 FROM dbo.sec_role WHERE code = N'CAISSIER')
    INSERT INTO dbo.sec_role(code, libelle, description, est_systeme)
    VALUES (N'CAISSIER', N'Caissier', N'Procede aux decaissements', 1);
IF NOT EXISTS (SELECT 1 FROM dbo.sec_role WHERE code = N'GESTIONNAIRE_PORTEFEUILLE')
    INSERT INTO dbo.sec_role(code, libelle, description, est_systeme)
    VALUES (N'GESTIONNAIRE_PORTEFEUILLE', N'Gestionnaire de portefeuille', N'Pilote un ou plusieurs portefeuilles et arbitre les demandes d''extension', 1);
IF NOT EXISTS (SELECT 1 FROM dbo.sec_role WHERE code = N'DAF')
    INSERT INTO dbo.sec_role(code, libelle, description, est_systeme)
    VALUES (N'DAF', N'Directeur Administratif et Financier', N'Role combine : cumule les droits d''Administrateur et de Caissier', 1);
GO

/* -- Profils standardises --------------------------------------------------- */
IF NOT EXISTS (SELECT 1 FROM dbo.sec_profil WHERE code = N'CAT_VALIDATEUR')
    INSERT INTO dbo.sec_profil(code, libelle, categorie, description)
    VALUES (N'CAT_VALIDATEUR', N'Categorie Validateur', N'VALIDATEUR', N'Profil pour les validateurs');
IF NOT EXISTS (SELECT 1 FROM dbo.sec_profil WHERE code = N'CAT_DEMANDEUR')
    INSERT INTO dbo.sec_profil(code, libelle, categorie, description)
    VALUES (N'CAT_DEMANDEUR', N'Categorie Demandeur', N'DEMANDEUR', N'Profil pour les demandeurs');
IF NOT EXISTS (SELECT 1 FROM dbo.sec_profil WHERE code = N'CAT_CAISSIER')
    INSERT INTO dbo.sec_profil(code, libelle, categorie, description)
    VALUES (N'CAT_CAISSIER', N'Categorie Caissier', N'CAISSIER', N'Profil pour les caissiers');
IF NOT EXISTS (SELECT 1 FROM dbo.sec_profil WHERE code = N'CAT_INTERIM')
    INSERT INTO dbo.sec_profil(code, libelle, categorie, description)
    VALUES (N'CAT_INTERIM', N'Categorie Interim', N'INTERIM', N'Profil pour les utilisateurs en interim');
GO

/* -- Types de bon de base --------------------------------------------------- */
IF NOT EXISTS (SELECT 1 FROM dbo.ref_type_bon WHERE code = N'RESTITUTION_CLIENT')
    INSERT INTO dbo.ref_type_bon(code, libelle, description, requiert_numero_client, requiert_partenaire, requiert_bl)
    VALUES (N'RESTITUTION_CLIENT', N'Restitution Client', N'Restitution d''avance ou de caution client', 1, 1, 1);
IF NOT EXISTS (SELECT 1 FROM dbo.ref_type_bon WHERE code = N'ACHAT')
    INSERT INTO dbo.ref_type_bon(code, libelle, description, requiert_numero_client, requiert_partenaire, requiert_bl)
    VALUES (N'ACHAT', N'Achat', N'Bon d''achat fournisseur', 0, 1, 1);
IF NOT EXISTS (SELECT 1 FROM dbo.ref_type_bon WHERE code = N'AVANCE')
    INSERT INTO dbo.ref_type_bon(code, libelle, description, requiert_numero_client, requiert_partenaire, requiert_bl)
    VALUES (N'AVANCE', N'Avance', N'Avance sur frais', 0, 0, 0);
IF NOT EXISTS (SELECT 1 FROM dbo.ref_type_bon WHERE code = N'REMBOURSEMENT')
    INSERT INTO dbo.ref_type_bon(code, libelle, description, requiert_numero_client, requiert_partenaire, requiert_bl)
    VALUES (N'REMBOURSEMENT', N'Remboursement', N'Remboursement de frais', 0, 1, 0);
GO

/* -- Permissions de base ---------------------------------------------------- */
IF NOT EXISTS (SELECT 1 FROM dbo.sec_permission WHERE code = N'BON_CREER')
    INSERT INTO dbo.sec_permission(code, libelle, module) VALUES (N'BON_CREER', N'Creer un bon', N'BON');
IF NOT EXISTS (SELECT 1 FROM dbo.sec_permission WHERE code = N'BON_VALIDER')
    INSERT INTO dbo.sec_permission(code, libelle, module) VALUES (N'BON_VALIDER', N'Valider un bon', N'BON');
IF NOT EXISTS (SELECT 1 FROM dbo.sec_permission WHERE code = N'BON_SIGNER')
    INSERT INTO dbo.sec_permission(code, libelle, module) VALUES (N'BON_SIGNER', N'Signer un bon', N'BON');
IF NOT EXISTS (SELECT 1 FROM dbo.sec_permission WHERE code = N'BON_DECAISSER')
    INSERT INTO dbo.sec_permission(code, libelle, module) VALUES (N'BON_DECAISSER', N'Decaisser un bon', N'CAISSE');
IF NOT EXISTS (SELECT 1 FROM dbo.sec_permission WHERE code = N'BON_MULTI_CC')
    INSERT INTO dbo.sec_permission(code, libelle, module) VALUES (N'BON_MULTI_CC', N'Bon sur plusieurs centres de cout', N'BON');
IF NOT EXISTS (SELECT 1 FROM dbo.sec_permission WHERE code = N'EXTENSION_APPROUVER')
    INSERT INTO dbo.sec_permission(code, libelle, module) VALUES (N'EXTENSION_APPROUVER', N'Approuver ou refuser une demande d''extension de budget', N'BON');
IF NOT EXISTS (SELECT 1 FROM dbo.sec_permission WHERE code = N'CAISSE_OUVRIR')
    INSERT INTO dbo.sec_permission(code, libelle, module) VALUES (N'CAISSE_OUVRIR', N'Ouvrir une caisse', N'CAISSE');
IF NOT EXISTS (SELECT 1 FROM dbo.sec_permission WHERE code = N'CAISSE_CLOTURER')
    INSERT INTO dbo.sec_permission(code, libelle, module) VALUES (N'CAISSE_CLOTURER', N'Cloturer une caisse', N'CAISSE');
IF NOT EXISTS (SELECT 1 FROM dbo.sec_permission WHERE code = N'CAISSE_MODIFIER')
    INSERT INTO dbo.sec_permission(code, libelle, module) VALUES (N'CAISSE_MODIFIER', N'Creer / modifier / (des)activer une caisse', N'CAISSE');
IF NOT EXISTS (SELECT 1 FROM dbo.sec_permission WHERE code = N'CAISSE_SUPPRIMER')
    INSERT INTO dbo.sec_permission(code, libelle, module) VALUES (N'CAISSE_SUPPRIMER', N'Supprimer une caisse', N'CAISSE');
IF NOT EXISTS (SELECT 1 FROM dbo.sec_permission WHERE code = N'PORTEFEUILLE_MODIFIER')
    INSERT INTO dbo.sec_permission(code, libelle, module) VALUES (N'PORTEFEUILLE_MODIFIER', N'Creer / modifier / (des)activer un portefeuille', N'PORTEFEUILLE');
IF NOT EXISTS (SELECT 1 FROM dbo.sec_permission WHERE code = N'PORTEFEUILLE_SUPPRIMER')
    INSERT INTO dbo.sec_permission(code, libelle, module) VALUES (N'PORTEFEUILLE_SUPPRIMER', N'Supprimer un portefeuille', N'PORTEFEUILLE');
IF NOT EXISTS (SELECT 1 FROM dbo.sec_permission WHERE code = N'CAISSE_PRINCIPAL_CHOISIR')
    INSERT INTO dbo.sec_permission(code, libelle, module) VALUES (N'CAISSE_PRINCIPAL_CHOISIR', N'Choisir la caisse principale lors d''un bon', N'BON');
IF NOT EXISTS (SELECT 1 FROM dbo.sec_permission WHERE code = N'BON_MODIFIER_SPEC')
    INSERT INTO dbo.sec_permission(code, libelle, module) VALUES (N'BON_MODIFIER_SPEC', N'Modifier un bon specifique', N'BON');
IF NOT EXISTS (SELECT 1 FROM dbo.sec_permission WHERE code = N'TRANSFERT_INITIER')
    INSERT INTO dbo.sec_permission(code, libelle, module) VALUES (N'TRANSFERT_INITIER', N'Initier un transfert', N'CAISSE');
IF NOT EXISTS (SELECT 1 FROM dbo.sec_permission WHERE code = N'INTERIM_DECLARER')
    INSERT INTO dbo.sec_permission(code, libelle, module) VALUES (N'INTERIM_DECLARER', N'Declarer un interim', N'SECURITE');
IF NOT EXISTS (SELECT 1 FROM dbo.sec_permission WHERE code = N'ADMIN_USER')
    INSERT INTO dbo.sec_permission(code, libelle, module) VALUES (N'ADMIN_USER', N'Administrer les utilisateurs', N'ADMIN');
IF NOT EXISTS (SELECT 1 FROM dbo.sec_permission WHERE code = N'ADMIN_ROLE')
    INSERT INTO dbo.sec_permission(code, libelle, module) VALUES (N'ADMIN_ROLE', N'Administrer les roles et profils', N'ADMIN');
GO


/* ============================================================================
   10. RECAPITULATIF
   ============================================================================ */
PRINT N'==========================================================================';
PRINT N'  Application Fond de Caisse - Schema initialise';
PRINT N'==========================================================================';
DECLARE @nbTables INT = (SELECT COUNT(*) FROM sys.tables WHERE schema_id = SCHEMA_ID(N'dbo')
    AND (name LIKE N'sec[_]%' OR name LIKE N'ref[_]%' OR name LIKE N'fin[_]%' OR name LIKE N'trx[_]%' OR name LIKE N'aud[_]%'));
DECLARE @nbFK INT = (SELECT COUNT(*) FROM sys.foreign_keys WHERE parent_object_id IN
    (SELECT object_id FROM sys.tables WHERE schema_id = SCHEMA_ID(N'dbo')));
DECLARE @nbIX INT = (SELECT COUNT(*) FROM sys.indexes WHERE is_primary_key = 0 AND is_unique_constraint = 0
    AND object_id IN (SELECT object_id FROM sys.tables WHERE schema_id = SCHEMA_ID(N'dbo')));
PRINT N'  Tables creees       : ' + CAST(@nbTables AS NVARCHAR(10));
PRINT N'  Foreign Keys        : ' + CAST(@nbFK AS NVARCHAR(10));
PRINT N'  Index secondaires   : ' + CAST(@nbIX AS NVARCHAR(10));
PRINT N'==========================================================================';
GO
