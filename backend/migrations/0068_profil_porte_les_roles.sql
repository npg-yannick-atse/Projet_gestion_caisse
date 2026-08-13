/* ============================================================================
   Un profil peut porter des RÔLES.
   Base : npg_gestion_caisse (SQL Server) — idempotent.

   Un profil ne transportait que des permissions. Générer un profil depuis
   quelqu'un capturait donc ce qu'il peut FAIRE, mais pas ce qu'il EST : le
   contournement administrateur et le verrou d'entrée de l'application tiennent
   au CODE du rôle, pas à une permission. Un remplaçant recevant un profil se
   retrouvait avec 59 permissions et la porte fermée.

   Avec cette table, un profil devient un paquet complet — rôles, permissions,
   périmètres — et suffit à équiper quelqu'un.

   CONSÉQUENCE À CONNAÎTRE : un profil portant SUPER_ADMIN rend administrateur
   quiconque le reçoit, avec le contournement des contrôles que cela implique.
   Attacher un rôle à un profil exige donc ADMIN_ROLE, comme y attacher une
   permission.
   ============================================================================ */
SET NOCOUNT ON;

IF OBJECT_ID(N'dbo.sec_profil_role', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.sec_profil_role (
        profil_id     BIGINT       NOT NULL,
        role_id       BIGINT       NOT NULL,
        created_at    DATETIME2(3) NOT NULL
            CONSTRAINT DF_sec_profil_role_created_at DEFAULT SYSUTCDATETIME(),
        created_by_id BIGINT       NULL,
        CONSTRAINT PK_sec_profil_role PRIMARY KEY (profil_id, role_id),
        CONSTRAINT FK_spr_profil FOREIGN KEY (profil_id) REFERENCES dbo.sec_profil(id),
        CONSTRAINT FK_spr_role   FOREIGN KEY (role_id)   REFERENCES dbo.sec_role(id)
    );
    PRINT N'Table sec_profil_role créée.';
END
GO

/* La résolution des rôles part TOUJOURS de l'utilisateur, donc du profil :
   la clé primaire suffit. L'index inverse sert aux écrans qui demandent
   « quels profils donnent ce rôle ». */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_spr_role')
    CREATE INDEX IX_spr_role ON dbo.sec_profil_role (role_id, profil_id);
GO

PRINT N'Un profil peut désormais porter des rôles.';
GO
