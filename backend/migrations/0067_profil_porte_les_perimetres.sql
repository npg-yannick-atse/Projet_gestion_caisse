/* ============================================================================
   Un profil peut désormais porter des PÉRIMÈTRES, pas seulement des permissions.
   Base : npg_gestion_caisse (SQL Server) — idempotent.

   Jusqu'ici, un profil ne transportait que des permissions. Recopier les droits
   d'une personne sur une autre exigeait donc deux gestes de nature différente :
   un profil pour les permissions, un clonage utilisateur → utilisateur pour les
   centres de coût, les natures d'opération et les divisions. Deux chemins pour
   une seule intention.

   Le profil devient le véhicule unique. Ces trois tables lui donnent ce qui lui
   manquait.

   CE QU'UN PROFIL NE PORTERA TOUJOURS PAS, et ce n'est pas un oubli :
     - les RÔLES, dont le code déclenche des règles écrites en dur ;
     - les accès aux CAISSES, qui désignent un coffre physique confié à une
       personne nommée — pas un droit qu'on distribue en paquet.

   Clé primaire composite (profil, cible) : le même profil ne peut pas porter
   deux fois le même centre, et le lien disparaît avec le profil.
   ============================================================================ */
SET NOCOUNT ON;

IF OBJECT_ID('dbo.sec_profil_cost_center', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.sec_profil_cost_center (
    profil_id      BIGINT NOT NULL,
    cost_center_id BIGINT NOT NULL,
    created_at     DATETIME2(3) NOT NULL CONSTRAINT DF_spcc_created DEFAULT SYSUTCDATETIME(),
    created_by_id  BIGINT NULL,
    CONSTRAINT PK_sec_profil_cost_center PRIMARY KEY (profil_id, cost_center_id),
    CONSTRAINT FK_spcc_profil FOREIGN KEY (profil_id) REFERENCES dbo.sec_profil(id) ON DELETE CASCADE,
    CONSTRAINT FK_spcc_cc FOREIGN KEY (cost_center_id) REFERENCES dbo.ref_cost_center(id)
  );
END
GO

IF OBJECT_ID('dbo.sec_profil_nature_operation', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.sec_profil_nature_operation (
    profil_id            BIGINT NOT NULL,
    nature_operation_id  BIGINT NOT NULL,
    created_at           DATETIME2(3) NOT NULL CONSTRAINT DF_spno_created DEFAULT SYSUTCDATETIME(),
    created_by_id        BIGINT NULL,
    CONSTRAINT PK_sec_profil_nature_operation PRIMARY KEY (profil_id, nature_operation_id),
    CONSTRAINT FK_spno_profil FOREIGN KEY (profil_id) REFERENCES dbo.sec_profil(id) ON DELETE CASCADE,
    CONSTRAINT FK_spno_nature FOREIGN KEY (nature_operation_id) REFERENCES dbo.ref_nature_operation(id)
  );
END
GO

IF OBJECT_ID('dbo.sec_profil_division_access', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.sec_profil_division_access (
    profil_id     BIGINT NOT NULL,
    division_id   BIGINT NOT NULL,
    created_at    DATETIME2(3) NOT NULL CONSTRAINT DF_spda_created DEFAULT SYSUTCDATETIME(),
    created_by_id BIGINT NULL,
    CONSTRAINT PK_sec_profil_division_access PRIMARY KEY (profil_id, division_id),
    CONSTRAINT FK_spda_profil FOREIGN KEY (profil_id) REFERENCES dbo.sec_profil(id) ON DELETE CASCADE,
    CONSTRAINT FK_spda_division FOREIGN KEY (division_id) REFERENCES dbo.ref_division(id)
  );
END
GO
