/*
  Chargement des centres de coût, et des directions qu'ils désignent.

  Source : export SAP TB03 du 13/08/2026 (Document/TB03_20260813_094153.xls),
  une seule colonne CENTRE_COUT, 34 valeurs.

  Deux formes s'y côtoient :

    21000-DG      → préfixe numérique + TIRET + abrégé de la DIRECTION
    DIBEX         → aucun tiret : entité qui ne relève d'aucune direction

  Les directions sont donc DÉDUITES du suffixe. Deux centres peuvent partager
  la même direction — 31310-DDV et 34100-DDV en sont un exemple — et deux
  centres peuvent partager le même préfixe pour des directions différentes :
  31100-DCR et 31100-DDC. Le code du centre est la chaîne ENTIÈRE, jamais l'une
  de ses moitiés.

  LIBELLÉS : l'export n'en contient aucun. Les directions et les centres
  reçoivent donc leur code comme libellé, et une description qui dit d'où ils
  viennent. Inventer « Direction Commerciale Régionale » à partir de « DCR »
  reviendrait à écrire dans un référentiel de production une information que
  personne n'a fournie. Les libellés réels se posent ensuite par un UPDATE.

  Idempotent : chaque insertion est gardée par un NOT EXISTS sur le code.
  Attention, `UQ_sec_direction_code` et `UQ_ref_cost_center_code` ne sont PAS
  filtrés sur `deleted_at` — un code supprimé en douceur bloquerait sa
  réinsertion. Les gardes portent donc sur le code seul, suppression comprise.
*/

/* ---- 1) Les directions, déduites du suffixe ------------------------------ */

DECLARE @directions TABLE (code nvarchar(100));
INSERT INTO @directions (code) VALUES
  ('DG'), ('CRP'), ('DSI'), ('DAC'), ('DAH'), ('DQS'), ('2SI'), ('DCR'),
  ('DDC'), ('DDV'), ('DSC'), ('DLG'), ('DTR'), ('DUS'), ('SFA'), ('SCD'),
  ('DMI'), ('SEA'), ('SMC'), ('SIF'), ('SEN'), ('DMK'), ('DVR'), ('DRC'),
  ('DVL'), ('DVX'), ('DRH'), ('DAF');

INSERT INTO dbo.sec_direction (code, libelle, description, est_actif)
SELECT d.code, d.code, N'Importée de l''export SAP TB03 du 13/08/2026 — libellé à compléter', 1
FROM @directions d
WHERE NOT EXISTS (SELECT 1 FROM dbo.sec_direction s WHERE s.code = d.code);
GO

/* ---- 2) Les centres de coût --------------------------------------------- */

DECLARE @centres TABLE (code nvarchar(100));
INSERT INTO @centres (code) VALUES
  ('21000-DG'), ('21410-CRP'), ('22100-DSI'), ('23100-DAC'), ('24100-DAH'),
  ('25100-DQS'), ('25400-2SI'), ('31100-DCR'), ('31100-DDC'), ('31310-DDV'),
  ('32100-DSC'), ('32310-DLG'), ('32410-DTR'), ('33100-DUS'), ('33220-SFA'),
  ('33230-SCD'), ('33310-DMI'), ('33330-SEA'), ('33340-SMC'), ('33440-SIF'),
  ('33450-SEN'), ('34100-DDV'), ('41100-DMK'), ('41100-DVR'), ('41210-DRC'),
  ('42100-DVL'), ('43100-DVX'), ('51100-DRH'), ('52100-DAF'),
  -- Sans tiret : aucune direction ne leur correspond, direction_id reste NULL.
  ('DIBEX'), ('IFAMCI'), ('PLANTATION'), ('PRINTEC'), ('SOLID');

INSERT INTO dbo.ref_cost_center (code, libelle, direction_id, est_actif)
SELECT
  c.code,
  c.code,
  -- Le suffixe n'existe que s'il y a un tiret ; sinon la sous-requête rend NULL.
  (SELECT TOP 1 s.id
     FROM dbo.sec_direction s
    WHERE CHARINDEX('-', c.code) > 0
      AND s.code = SUBSTRING(c.code, CHARINDEX('-', c.code) + 1, 100)
      AND s.deleted_at IS NULL),
  1
FROM @centres c
WHERE NOT EXISTS (SELECT 1 FROM dbo.ref_cost_center cc WHERE cc.code = c.code);
GO
