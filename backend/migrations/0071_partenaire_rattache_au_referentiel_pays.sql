/* ============================================================================
   Le pays d'un partenaire devient un lien, plus une chaîne de caractères.
   Base : npg_gestion_caisse (SQL Server) — idempotent.

   `ref_partenaire.pays` est un nvarchar(100) qui contient en réalité un code
   ISO à deux lettres — « CI », « GH », « FR » — recopié de SAP (LFA1-LAND1).
   L'écran affichait donc « GH » à des gens qui cherchent « Ghana », et rien ne
   garantissait que le code désigne un pays connu du référentiel.

   Le rattachement est sans perte : les 1601 partenaires présents portent tous
   un code qui correspond à une ligne de `ref_pays`. Vérifié avant écriture,
   1601 sur 1601, aucun orphelin.

   LA COLONNE TEXTE RESTE. La supprimer casserait l'écran Clients, qui la lit
   encore, et priverait d'explication un code que le référentiel ignorerait un
   jour. Elle devient une trace de ce que SAP a dit ; `pays_id` devient la
   vérité. Deux colonnes pour un temps, le temps que les écrans suivent.

   POURQUOI MAINTENANT : la synchronisation des fournisseurs va introduire 884
   lignes venant de SAP. Autant qu'elles arrivent déjà rattachées, plutôt que
   d'avoir à les reprendre ensuite.
   ============================================================================ */
SET NOCOUNT ON;

/* ---- 1) La colonne et son lien ------------------------------------------ */

IF COL_LENGTH('dbo.ref_partenaire', 'pays_id') IS NULL
BEGIN
  ALTER TABLE dbo.ref_partenaire ADD pays_id BIGINT NULL;
  PRINT 'ref_partenaire.pays_id ajoutée.';
END
ELSE
  PRINT 'ref_partenaire.pays_id déjà présente.';
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_ref_partenaire_pays')
BEGIN
  ALTER TABLE dbo.ref_partenaire
    ADD CONSTRAINT FK_ref_partenaire_pays
    FOREIGN KEY (pays_id) REFERENCES dbo.ref_pays(id);
  PRINT 'FK_ref_partenaire_pays créée.';
END
GO

/* Filtré sur NOT NULL : la majorité des lignes finira renseignée, mais un
   partenaire sans pays reste légitime — un index qui les compte tous n'aurait
   servi à rien. */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ref_partenaire_pays_id')
BEGIN
  CREATE INDEX IX_ref_partenaire_pays_id
      ON dbo.ref_partenaire(pays_id) WHERE pays_id IS NOT NULL;
  PRINT 'IX_ref_partenaire_pays_id créé.';
END
GO

/* ---- 2) Reprise des partenaires existants ------------------------------- */

/* `deleted_at IS NULL` des DEUX côtés : un pays supprimé ne doit pas être
   ressuscité par un lien, et un partenaire supprimé n'a pas à être retouché. */
UPDATE p
   SET p.pays_id = r.id
  FROM dbo.ref_partenaire p
  JOIN dbo.ref_pays r
    ON r.code = p.pays
   AND r.deleted_at IS NULL
 WHERE p.pays_id IS NULL
   AND p.pays IS NOT NULL
   AND p.deleted_at IS NULL;

PRINT CONCAT('Partenaires rattachés : ', @@ROWCOUNT);
GO

/* ---- 3) Ce qui n'a pas pu être rattaché --------------------------------- */

/* Informatif, pas bloquant : un code inconnu du référentiel laisse `pays_id`
   nul et le partenaire reste utilisable. Mieux vaut un fournisseur sans pays
   qu'un fournisseur absent — l'un se corrige, l'autre bloque un bon. */
DECLARE @orphelins INT =
  (SELECT COUNT(*) FROM dbo.ref_partenaire p
    WHERE p.deleted_at IS NULL AND p.pays IS NOT NULL AND p.pays_id IS NULL);

IF @orphelins > 0
  PRINT CONCAT('ATTENTION : ', @orphelins, ' partenaires portent un code pays inconnu du référentiel.');
ELSE
  PRINT 'Aucun code pays orphelin.';
GO
