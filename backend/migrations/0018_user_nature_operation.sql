/* ============================================================================
   Restriction des natures d'operation par utilisateur
   Base : npg_gestion_caisse (SQL Server) — idempotent.

   Table de liaison utilisateur <-> nature d'operation : liste blanche des
   natures qu'un utilisateur a le droit d'utiliser a la creation d'un bon.

   SEMANTIQUE STRICTE : sans aucune ligne pour un utilisateur, celui-ci ne peut
   utiliser AUCUNE nature (donc ne peut creer aucun bon) — sauf les
   administrateurs qui passent partout (cf. AuthorizationService.isAdmin).
   Il faut donc attribuer des natures aux utilisateurs existants avant la mise
   en service, sinon la creation de bons est bloquee pour les non-admins.

   Meme forme que sec_user_division_access (perimetre par utilisateur).
   ============================================================================ */
SET NOCOUNT ON;

IF OBJECT_ID(N'dbo.sec_user_nature_operation', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.sec_user_nature_operation (
        user_id             BIGINT NOT NULL,
        nature_operation_id BIGINT NOT NULL,
        created_at          DATETIME2(3) NOT NULL CONSTRAINT DF_sec_uno_created DEFAULT SYSUTCDATETIME(),
        created_by_id       BIGINT NULL,
        CONSTRAINT PK_sec_user_nature_operation PRIMARY KEY CLUSTERED (user_id, nature_operation_id),
        CONSTRAINT FK_sec_uno_user FOREIGN KEY (user_id)
            REFERENCES dbo.sec_user(id),
        CONSTRAINT FK_sec_uno_nature FOREIGN KEY (nature_operation_id)
            REFERENCES dbo.ref_nature_operation(id)
    );
    CREATE INDEX IX_sec_uno_user ON dbo.sec_user_nature_operation(user_id);
    PRINT N'Table sec_user_nature_operation creee.';
END

PRINT N'Migration 0018 (natures d''operation par utilisateur) terminee.';
GO
