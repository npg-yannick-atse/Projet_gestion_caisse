/* ============================================================================
   Fusion : « nature d'opération » disparaît, seule reste la nature comptable.
   Base : npg_gestion_caisse (SQL Server) — idempotent.

   `ref_nature_operation` n'était pas un référentiel : c'était le miroir des
   natures comptables utilisables sur un bon, entretenu par la synchronisation
   SAP. Deux tables pour un concept, deux vocabulaires, et un écran qui parlait
   de « nature d'opération » là où le métier ne connaît que le plan comptable.

   La correspondance était parfaite au moment de la fusion : 180 natures visant
   180 comptes DISTINCTS, aucune collision, aucun orphelin.

   CE QUI REMPLACE LA TABLE : un drapeau `utilisable_bon` sur la nature
   comptable. Il fallait le garder — sans lui, un demandeur choisirait parmi les
   599 comptes du plan comptable au lieu des 180 réellement employés.

   MOMENT CHOISI : sous-bons, écritures et périmètres sont VIDES. La reprise de
   données est donc nulle, hors deux liaisons avec un centre de coût, reportées
   ci-dessous. Cette migration serait bien plus délicate sur une base vivante.
   ============================================================================ */
SET NOCOUNT ON;

/* ---- 1) Le drapeau qui remplace la table -------------------------------- */

IF COL_LENGTH('dbo.ref_nature_comptable', 'utilisable_bon') IS NULL
    ALTER TABLE dbo.ref_nature_comptable
      ADD utilisable_bon BIT NOT NULL CONSTRAINT DF_rnc_utilisable DEFAULT 0;
GO

UPDATE nc
   SET nc.utilisable_bon = 1
  FROM dbo.ref_nature_comptable nc
 WHERE EXISTS (SELECT 1 FROM dbo.ref_nature_operation o WHERE o.nature_comptable_id = nc.id)
   AND nc.utilisable_bon = 0;
GO

/* ---- 2) Les liaisons avec un centre de coût rejoignent la table comptable */

INSERT INTO dbo.ref_nature_comptable_cost_center (nature_comptable_id, cost_center_id, created_by_id)
SELECT DISTINCT o.nature_comptable_id, l.cost_center_id, l.created_by_id
  FROM dbo.ref_nature_operation_cost_center l
  JOIN dbo.ref_nature_operation o ON o.id = l.nature_operation_id
 WHERE o.nature_comptable_id IS NOT NULL
   AND NOT EXISTS (
        SELECT 1 FROM dbo.ref_nature_comptable_cost_center x
         WHERE x.nature_comptable_id = o.nature_comptable_id AND x.cost_center_id = l.cost_center_id);
GO

/* ---- 3) Les périmètres portent désormais sur la nature comptable -------- */

IF OBJECT_ID('dbo.sec_user_nature_comptable', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.sec_user_nature_comptable (
    user_id             BIGINT NOT NULL,
    nature_comptable_id BIGINT NOT NULL,
    created_at          DATETIME2(3) NOT NULL CONSTRAINT DF_sunc_created DEFAULT SYSUTCDATETIME(),
    created_by_id       BIGINT NULL,
    CONSTRAINT PK_sec_user_nature_comptable PRIMARY KEY (user_id, nature_comptable_id),
    CONSTRAINT FK_sunc_user FOREIGN KEY (user_id) REFERENCES dbo.sec_user(id),
    CONSTRAINT FK_sunc_nature FOREIGN KEY (nature_comptable_id) REFERENCES dbo.ref_nature_comptable(id)
  );
END
GO

IF OBJECT_ID('dbo.sec_profil_nature_comptable', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.sec_profil_nature_comptable (
    profil_id           BIGINT NOT NULL,
    nature_comptable_id BIGINT NOT NULL,
    created_at          DATETIME2(3) NOT NULL CONSTRAINT DF_spnc_created DEFAULT SYSUTCDATETIME(),
    created_by_id       BIGINT NULL,
    CONSTRAINT PK_sec_profil_nature_comptable PRIMARY KEY (profil_id, nature_comptable_id),
    CONSTRAINT FK_spnc_profil FOREIGN KEY (profil_id) REFERENCES dbo.sec_profil(id) ON DELETE CASCADE,
    CONSTRAINT FK_spnc_nature FOREIGN KEY (nature_comptable_id) REFERENCES dbo.ref_nature_comptable(id)
  );
END
GO

/* Report du contenu éventuel (vide au 13/08/2026, mais la migration doit
   pouvoir tourner ailleurs sans rien perdre). */
INSERT INTO dbo.sec_user_nature_comptable (user_id, nature_comptable_id, created_by_id)
SELECT DISTINCT u.user_id, o.nature_comptable_id, u.created_by_id
  FROM dbo.sec_user_nature_operation u
  JOIN dbo.ref_nature_operation o ON o.id = u.nature_operation_id
 WHERE o.nature_comptable_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM dbo.sec_user_nature_comptable x
                    WHERE x.user_id = u.user_id AND x.nature_comptable_id = o.nature_comptable_id);

INSERT INTO dbo.sec_profil_nature_comptable (profil_id, nature_comptable_id, created_by_id)
SELECT DISTINCT pr.profil_id, o.nature_comptable_id, pr.created_by_id
  FROM dbo.sec_profil_nature_operation pr
  JOIN dbo.ref_nature_operation o ON o.id = pr.nature_operation_id
 WHERE o.nature_comptable_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM dbo.sec_profil_nature_comptable x
                    WHERE x.profil_id = pr.profil_id AND x.nature_comptable_id = o.nature_comptable_id);
GO

/* ---- 4) Le sous-bon ne garde que la nature comptable -------------------- */

/* Report avant suppression : un sous-bon qui n'aurait que l'ancienne colonne
   renseignée doit conserver son imputation. */
UPDATE sb
   SET sb.nature_comptable_id = o.nature_comptable_id
  FROM dbo.trx_sous_bon sb
  JOIN dbo.ref_nature_operation o ON o.id = sb.nature_operation_id
 WHERE sb.nature_comptable_id IS NULL AND o.nature_comptable_id IS NOT NULL;
GO

DECLARE @fk sysname;
SELECT @fk = fk.name FROM sys.foreign_keys fk
 WHERE fk.parent_object_id = OBJECT_ID('dbo.trx_sous_bon')
   AND fk.referenced_object_id = OBJECT_ID('dbo.ref_nature_operation');
IF @fk IS NOT NULL EXEC('ALTER TABLE dbo.trx_sous_bon DROP CONSTRAINT ' + @fk);

IF COL_LENGTH('dbo.trx_sous_bon', 'nature_operation_id') IS NOT NULL
    ALTER TABLE dbo.trx_sous_bon DROP COLUMN nature_operation_id;
GO

/* ---- 5) Disparition des tables de l'ancien concept ---------------------- */

IF OBJECT_ID('dbo.ref_nature_operation_cost_center', 'U') IS NOT NULL
    DROP TABLE dbo.ref_nature_operation_cost_center;
IF OBJECT_ID('dbo.sec_user_nature_operation', 'U') IS NOT NULL
    DROP TABLE dbo.sec_user_nature_operation;
IF OBJECT_ID('dbo.sec_profil_nature_operation', 'U') IS NOT NULL
    DROP TABLE dbo.sec_profil_nature_operation;
IF OBJECT_ID('dbo.ref_nature_operation', 'U') IS NOT NULL
    DROP TABLE dbo.ref_nature_operation;
GO
