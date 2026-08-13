/*
  Rétablit la Namibie, et lui donne sa division.

  `ref_pays` comptait 244 pays là où la source en a 245 : le code ISO « NA »
  manquait, et lui seul. Le trou est net dans la séquence — MZ, puis NC. C'est
  la méprise classique sur ce code : la plupart des lecteurs de tableur et des
  bibliothèques de données interprètent « NA » comme *Not Available* et le
  rendent vide. L'import d'origine (08/07/2026) y a laissé la Namibie.

  Elle est bien présente dans COUNTRY.xls, feuille COUNTRIES ligne 156, et
  figure parmi les pays actifs — division SS14.

  Le libellé reprend exactement celui du fichier, pour rester homogène avec les
  244 autres (« Nvlle Calédonie », « Emir.arab.unis »… : ce sont les libellés
  SAP, tronqués à leur longueur d'origine).
*/

INSERT INTO dbo.ref_pays (code, libelle, est_actif)
SELECT N'NA', N'Namibie', 1
WHERE NOT EXISTS (SELECT 1 FROM dbo.ref_pays WHERE code = N'NA');
GO

INSERT INTO dbo.ref_division (code, libelle, pays_id, est_actif)
SELECT N'SS14', N'SS14', p.id, 1
FROM dbo.ref_pays p
WHERE p.code = N'NA'
  AND p.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM dbo.ref_division d WHERE d.pays_id = p.id AND d.code = N'SS14'
  );
GO
