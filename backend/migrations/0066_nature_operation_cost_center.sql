/* ============================================================================
   Liaison MULTIPLE entre natures d'opération et centres de coût.
   Base : npg_gestion_caisse (SQL Server) — idempotent.

   PRÉCISION DE VOCABULAIRE (13/08/2026) : ce que l'application appelle
   « nature comptable » — le menu, l'écran, le formulaire — est la table
   `ref_nature_operation`. `ref_nature_comptable` est le catalogue PCGG importé
   de SAP, consulté et non géré. La migration 0065 avait visé le catalogue :
   elle reste en place (5 liens y ont été saisis), mais c'est ICI que la
   liaison sert.

   `ref_nature_operation.cost_center_id` n'admettait qu'UN centre de coût, et
   ce centre était IMPOSÉ au sous-bon. Avec plusieurs centres, la règle devient
   une restriction : le centre du sous-bon doit figurer parmi ceux de la
   nature. Une nature n'ayant qu'un seul centre se comporte exactement comme
   avant — il reste le seul choix possible.
   ============================================================================ */
SET NOCOUNT ON;

IF OBJECT_ID(N'dbo.ref_nature_operation_cost_center', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ref_nature_operation_cost_center (
        nature_operation_id BIGINT       NOT NULL,
        cost_center_id      BIGINT       NOT NULL,
        created_at          DATETIME2(3) NOT NULL
            CONSTRAINT DF_rnocc_created_at DEFAULT SYSUTCDATETIME(),
        created_by_id       BIGINT       NULL,
        CONSTRAINT PK_ref_nature_operation_cost_center
            PRIMARY KEY (nature_operation_id, cost_center_id),
        CONSTRAINT FK_rnocc_nature FOREIGN KEY (nature_operation_id)
            REFERENCES dbo.ref_nature_operation(id),
        CONSTRAINT FK_rnocc_cost_center FOREIGN KEY (cost_center_id)
            REFERENCES dbo.ref_cost_center(id)
    );
    PRINT N'Table ref_nature_operation_cost_center créée.';
END
GO

/* La clé primaire couvre le sens nature → centres ; cet index couvre le sens
   centre → natures, tout aussi utilisé puisque l'écran va dans les deux sens. */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_rnocc_cost_center')
    CREATE INDEX IX_rnocc_cost_center
        ON dbo.ref_nature_operation_cost_center (cost_center_id, nature_operation_id);
GO

/* Reprise de l'ancien lien unique : ce qui était imposé devient le premier
   élément de la liste autorisée. Aucune nature ne change de comportement. */
INSERT INTO dbo.ref_nature_operation_cost_center (nature_operation_id, cost_center_id)
SELECT n.id, n.cost_center_id
FROM dbo.ref_nature_operation n
WHERE n.cost_center_id IS NOT NULL
  AND n.deleted_at IS NULL
  AND NOT EXISTS (
      SELECT 1 FROM dbo.ref_nature_operation_cost_center l
      WHERE l.nature_operation_id = n.id AND l.cost_center_id = n.cost_center_id
  );
GO

PRINT N'Liaison natures d''opération ↔ centres de coût prête (permission NATURE_CC_LIER, migration 0065).';
GO
