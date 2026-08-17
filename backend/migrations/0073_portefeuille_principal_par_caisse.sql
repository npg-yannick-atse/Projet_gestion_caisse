/* ============================================================================
   Un portefeuille principal par caisse.
   Base : npg_gestion_caisse (SQL Server) — idempotent.

   La caisse porte déjà `est_principale` ; le portefeuille gagne l'équivalent.
   Il ne change RIEN aux flux d'argent : c'est une désignation, pas un circuit.
   Elle sert à proposer le bon portefeuille par défaut plutôt que de faire
   chercher dans une liste où six portefeuilles de direction se ressemblent.

   L'unicité est garantie par la BASE, pas seulement par le service : un index
   unique filtré sur `est_principal = 1` et les lignes vivantes. Deux principaux
   sur une même caisse ne veulent rien dire, et l'écran ne doit pas être le seul
   à l'empêcher.

   Le filtre sur `deleted_at` est indispensable : sans lui, un portefeuille
   principal supprimé occuperait la place pour toujours — c'est exactement le
   piège rencontré sur ref_pays et ref_division, dont la contrainte UNIQUE non
   filtrée bloquait les réinsertions.
   ============================================================================ */
SET NOCOUNT ON;

IF COL_LENGTH('dbo.fin_portefeuille', 'est_principal') IS NULL
BEGIN
  ALTER TABLE dbo.fin_portefeuille
    ADD est_principal BIT NOT NULL CONSTRAINT DF_fin_portefeuille_est_principal DEFAULT 0;
  PRINT 'fin_portefeuille.est_principal ajoutée.';
END
ELSE
  PRINT 'fin_portefeuille.est_principal déjà présente.';
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_fin_portefeuille_principal_par_caisse')
BEGIN
  CREATE UNIQUE INDEX UX_fin_portefeuille_principal_par_caisse
      ON dbo.fin_portefeuille(caisse_source_id)
   WHERE est_principal = 1 AND deleted_at IS NULL;
  PRINT 'UX_fin_portefeuille_principal_par_caisse créé.';
END
ELSE
  PRINT 'Index d''unicité déjà présent.';
GO

/* ---- Reprise : une caisse n'ayant qu'UN SEUL portefeuille -----------------
   Le choix est alors sans ambiguïté, autant l'inscrire. Une caisse en ayant
   plusieurs est laissée telle quelle : désigner le principal est une décision
   métier, pas une devinette alphabétique. */

UPDATE p
   SET p.est_principal = 1
  FROM dbo.fin_portefeuille p
 WHERE p.deleted_at IS NULL
   AND p.est_principal = 0
   AND (SELECT COUNT(*) FROM dbo.fin_portefeuille x
         WHERE x.caisse_source_id = p.caisse_source_id AND x.deleted_at IS NULL) = 1;

PRINT CONCAT('Portefeuilles désignés principaux (caisse à un seul portefeuille) : ', @@ROWCOUNT);
GO
