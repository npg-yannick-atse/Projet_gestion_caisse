/* ============================================================================
   Un portefeuille principal appartient à sa CAISSE.
   Base : npg_gestion_caisse (SQL Server) — idempotent.

   Jusqu'ici tout portefeuille devait appartenir à un USER ou à une DIRECTION.
   On était donc forcé de prétendre qu'une réserve de caisse appartenait à
   quelqu'un — ce qui est faux, et fausse ensuite les périmètres : le
   portefeuille apparaissait dans l'enveloppe de la direction désignée.

   Un troisième type, CAISSE. `proprietaire_id` porte alors l'identifiant de la
   caisse : la colonne reste NOT NULL, et la valeur a un sens.

   AUCUN AUTRE CODE N'EST À REPRENDRE. Les endroits qui lisent le propriétaire
   testent tous une ÉGALITÉ à 'USER' ou 'DIRECTION' — périmètre des bons,
   demandes de recharge, portefeuilles visibles. Un portefeuille de caisse n'y
   entre donc jamais, et c'est exactement ce qu'on veut : on ne dépense pas
   depuis la réserve, elle alimente la caisse.
   ============================================================================ */
SET NOCOUNT ON;

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_fin_pf_type')
BEGIN
  ALTER TABLE dbo.fin_portefeuille DROP CONSTRAINT CK_fin_pf_type;
  PRINT 'CK_fin_pf_type retirée.';
END
GO

ALTER TABLE dbo.fin_portefeuille WITH CHECK ADD CONSTRAINT CK_fin_pf_type CHECK (
  proprietaire_type IN (N'USER', N'DIRECTION', N'CAISSE')
);
PRINT 'CK_fin_pf_type recréée avec CAISSE.';
GO

/* Un principal existant est rattaché à sa caisse. Aucun n'existe au moment
   d'écrire ceci — les trois portefeuilles ont été rendus opérationnels — mais
   la migration doit valoir pour une base où l'on en aurait déjà créé. */
UPDATE dbo.fin_portefeuille
   SET proprietaire_type = N'CAISSE',
       proprietaire_id   = caisse_source_id
 WHERE est_principal = 1
   AND deleted_at IS NULL
   AND proprietaire_type <> N'CAISSE';

PRINT CONCAT('Portefeuilles principaux rattachés à leur caisse : ', @@ROWCOUNT);
GO
