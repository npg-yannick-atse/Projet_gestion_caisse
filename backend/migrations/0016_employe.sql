/* ============================================================================
   Gestion des employés et de leurs bénéfices (Master Data)
   Base : npg_gestion_caisse (SQL Server) — idempotent.

   3 tables :
     - ref_employe          : l'employé (nom, prénoms, matricule, direction, salaire)
     - ref_type_benefice    : les types de bénéfice (ex. billet d'avion)
     - ref_employe_benefice : le bénéfice accordé à un employé (montant + période
                              de validité début/fin + drapeau valide/invalide)

   RÈGLE MÉTIER CENTRALE : un employé ne peut avoir qu'UN SEUL bénéfice VALIDE
   par type à la fois. Pour lui accorder un second billet d'avion, il faut
   d'abord passer le précédent à invalide. L'ancien reste en base (historique).
   Cette règle est imposée par l'index unique FILTRÉ UQ_ref_emp_benef_valide
   (WHERE est_valide = 1) : la base la rend physiquement impossible à violer,
   même en cas de bug applicatif ou d'écriture concurrente.

   Note : est_valide est un interrupteur MANUEL, indépendant de date_debut /
   date_fin (qui décrivent la période couverte par le bénéfice).
   ============================================================================ */
SET NOCOUNT ON;

/* ---------------------------------------------------------------- Employé -- */
IF OBJECT_ID(N'dbo.ref_employe', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ref_employe (
        id              BIGINT IDENTITY(1,1) NOT NULL,
        matricule       NVARCHAR(50) NOT NULL,
        nom             NVARCHAR(150) NOT NULL,
        prenoms         NVARCHAR(200) NOT NULL,
        direction_id    BIGINT NULL,
        salaire         DECIMAL(19,4) NULL,
        est_actif       BIT NOT NULL CONSTRAINT DF_ref_employe_actif DEFAULT (1),
        created_at      DATETIME2(3) NOT NULL CONSTRAINT DF_ref_employe_created DEFAULT SYSUTCDATETIME(),
        created_by_id   BIGINT NULL,
        updated_at      DATETIME2(3) NULL,
        updated_by_id   BIGINT NULL,
        deleted_at      DATETIME2(3) NULL,
        deleted_by_id   BIGINT NULL,
        version         INT NOT NULL CONSTRAINT DF_ref_employe_version DEFAULT (1),
        CONSTRAINT PK_ref_employe PRIMARY KEY CLUSTERED (id),
        CONSTRAINT UQ_ref_employe_matricule UNIQUE (matricule),
        CONSTRAINT CK_ref_employe_salaire CHECK (salaire IS NULL OR salaire >= 0),
        CONSTRAINT FK_ref_employe_direction FOREIGN KEY (direction_id)
            REFERENCES dbo.sec_direction(id)
    );
    CREATE INDEX IX_ref_employe_direction ON dbo.ref_employe(direction_id);
    CREATE INDEX IX_ref_employe_nom ON dbo.ref_employe(nom);
    PRINT N'Table ref_employe créée.';
END

/* ------------------------------------------------------ Type de bénéfice -- */
IF OBJECT_ID(N'dbo.ref_type_benefice', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ref_type_benefice (
        id              BIGINT IDENTITY(1,1) NOT NULL,
        code            NVARCHAR(50) NOT NULL,
        libelle         NVARCHAR(200) NOT NULL,
        est_actif       BIT NOT NULL CONSTRAINT DF_ref_type_benefice_actif DEFAULT (1),
        created_at      DATETIME2(3) NOT NULL CONSTRAINT DF_ref_type_benefice_created DEFAULT SYSUTCDATETIME(),
        created_by_id   BIGINT NULL,
        updated_at      DATETIME2(3) NULL,
        updated_by_id   BIGINT NULL,
        deleted_at      DATETIME2(3) NULL,
        deleted_by_id   BIGINT NULL,
        version         INT NOT NULL CONSTRAINT DF_ref_type_benefice_version DEFAULT (1),
        CONSTRAINT PK_ref_type_benefice PRIMARY KEY CLUSTERED (id),
        CONSTRAINT UQ_ref_type_benefice_code UNIQUE (code)
    );
    PRINT N'Table ref_type_benefice créée.';
END

/* -------------------------------------------- Bénéfice accordé à l'employé -- */
IF OBJECT_ID(N'dbo.ref_employe_benefice', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ref_employe_benefice (
        id                BIGINT IDENTITY(1,1) NOT NULL,
        employe_id        BIGINT NOT NULL,
        type_benefice_id  BIGINT NOT NULL,
        montant           DECIMAL(19,4) NOT NULL,
        date_debut        DATE NOT NULL,
        date_fin          DATE NOT NULL,
        est_valide        BIT NOT NULL CONSTRAINT DF_ref_emp_benef_valide DEFAULT (1),
        commentaire       NVARCHAR(MAX) NULL,
        created_at        DATETIME2(3) NOT NULL CONSTRAINT DF_ref_emp_benef_created DEFAULT SYSUTCDATETIME(),
        created_by_id     BIGINT NULL,
        updated_at        DATETIME2(3) NULL,
        updated_by_id     BIGINT NULL,
        deleted_at        DATETIME2(3) NULL,
        deleted_by_id     BIGINT NULL,
        version           INT NOT NULL CONSTRAINT DF_ref_emp_benef_version DEFAULT (1),
        CONSTRAINT PK_ref_employe_benefice PRIMARY KEY CLUSTERED (id),
        CONSTRAINT CK_ref_emp_benef_montant CHECK (montant > 0),
        CONSTRAINT CK_ref_emp_benef_periode CHECK (date_fin >= date_debut),
        CONSTRAINT FK_ref_emp_benef_employe FOREIGN KEY (employe_id)
            REFERENCES dbo.ref_employe(id),
        CONSTRAINT FK_ref_emp_benef_type FOREIGN KEY (type_benefice_id)
            REFERENCES dbo.ref_type_benefice(id)
    );
    CREATE INDEX IX_ref_emp_benef_employe ON dbo.ref_employe_benefice(employe_id);
    CREATE INDEX IX_ref_emp_benef_type ON dbo.ref_employe_benefice(type_benefice_id);
    PRINT N'Table ref_employe_benefice créée.';
END

/* RÈGLE : un seul bénéfice VALIDE par (employé, type). L'index filtré n'indexe
   que les lignes est_valide = 1 : les bénéfices désactivés (historique) ne
   comptent pas et peuvent être aussi nombreux que voulu sur le même type. */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ_ref_emp_benef_valide'
               AND object_id = OBJECT_ID(N'dbo.ref_employe_benefice'))
BEGIN
    CREATE UNIQUE INDEX UQ_ref_emp_benef_valide
        ON dbo.ref_employe_benefice(employe_id, type_benefice_id)
        WHERE est_valide = 1;
    PRINT N'Index unique filtré UQ_ref_emp_benef_valide créé (1 seul bénéfice valide par type).';
END

/* Quelques types de bénéfice pour démarrer (modifiables via le back-office). */
INSERT INTO dbo.ref_type_benefice(code, libelle)
SELECT v.code, v.libelle
FROM (VALUES
    (N'BILLET_AVION', N'Billet d''avion'),
    (N'LOGEMENT',     N'Logement'),
    (N'VEHICULE',     N'Véhicule de fonction'),
    (N'TELEPHONE',    N'Téléphone'),
    (N'CARBURANT',    N'Carburant'),
    (N'SCOLARITE',    N'Frais de scolarité'),
    (N'ASSURANCE',    N'Assurance santé')
) AS v(code, libelle)
WHERE NOT EXISTS (SELECT 1 FROM dbo.ref_type_benefice t WHERE t.code = v.code);

PRINT N'Migration 0016 (employés & bénéfices) terminée.';
GO
