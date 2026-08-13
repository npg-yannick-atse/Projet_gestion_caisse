/* ============================================================================
   Liaison MULTIPLE entre natures comptables et centres de coût.
   Base : npg_gestion_caisse (SQL Server) — idempotent.

   `ref_nature_comptable.cost_center_id` n'admettait qu'UN centre de coût, et
   aucun code ne la lisait : ni écran pour la saisir, ni règle pour l'appliquer.
   Or une même nature comptable sert à plusieurs services — un carburant est
   imputé à la logistique comme à la direction générale.

   On passe donc à une table de liaison, lisible dans les deux sens : depuis une
   nature on voit ses centres de coût, depuis un centre de coût on voit ses
   natures. L'ancienne colonne est CONSERVÉE le temps de vérifier que plus rien
   ne s'y réfère ; les valeurs qu'elle contenait sont reprises dans la liaison.
   ============================================================================ */
SET NOCOUNT ON;

IF OBJECT_ID(N'dbo.ref_nature_comptable_cost_center', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ref_nature_comptable_cost_center (
        nature_comptable_id BIGINT       NOT NULL,
        cost_center_id      BIGINT       NOT NULL,
        created_at          DATETIME2(3) NOT NULL
            CONSTRAINT DF_rncc_created_at DEFAULT SYSUTCDATETIME(),
        created_by_id       BIGINT       NULL,
        CONSTRAINT PK_ref_nature_comptable_cost_center
            PRIMARY KEY (nature_comptable_id, cost_center_id),
        CONSTRAINT FK_rncc_nature FOREIGN KEY (nature_comptable_id)
            REFERENCES dbo.ref_nature_comptable(id),
        CONSTRAINT FK_rncc_cost_center FOREIGN KEY (cost_center_id)
            REFERENCES dbo.ref_cost_center(id)
    );
    PRINT N'Table ref_nature_comptable_cost_center créée.';
END
GO

/* La lecture se fait dans les DEUX sens : la clé primaire couvre le sens
   nature → centres, cet index couvre le sens centre → natures. */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_rncc_cost_center')
    CREATE INDEX IX_rncc_cost_center
        ON dbo.ref_nature_comptable_cost_center (cost_center_id, nature_comptable_id);
GO

/* Reprise de l'ancien lien unique, s'il en restait. */
INSERT INTO dbo.ref_nature_comptable_cost_center (nature_comptable_id, cost_center_id)
SELECT n.id, n.cost_center_id
FROM dbo.ref_nature_comptable n
WHERE n.cost_center_id IS NOT NULL
  AND n.deleted_at IS NULL
  AND NOT EXISTS (
      SELECT 1 FROM dbo.ref_nature_comptable_cost_center l
      WHERE l.nature_comptable_id = n.id AND l.cost_center_id = n.cost_center_id
  );
GO

IF NOT EXISTS (SELECT 1 FROM dbo.sec_permission WHERE code = N'NATURE_CC_LIER')
    INSERT INTO dbo.sec_permission(code, libelle, module)
    VALUES (N'NATURE_CC_LIER', N'Lier natures comptables et centres de coût', N'REFERENTIEL');
GO

INSERT INTO dbo.sec_role_permission(role_id, permission_id)
SELECT r.id, p.id
FROM dbo.sec_role r
CROSS JOIN dbo.sec_permission p
WHERE r.code IN (N'SUPER_ADMIN', N'ADMINISTRATEUR')
  AND p.code = N'NATURE_CC_LIER'
  AND NOT EXISTS (
      SELECT 1 FROM dbo.sec_role_permission rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );
PRINT N'Permission NATURE_CC_LIER créée et accordée aux administrateurs.';
GO
