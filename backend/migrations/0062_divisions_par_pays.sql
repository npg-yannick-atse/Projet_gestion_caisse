/*
  Rattache chaque pays actif à sa division.

  Source : COUNTRY.xls, feuille `active_countries` (Document/imports/), 71 pays
  portant chacun un `Country_Division` — SS11, SS12, SS13 ou SS14.

  Le modèle de la base va dans l'autre sens que le fichier : une division
  APPARTIENT à un pays (`ref_division.pays_id`), alors que la feuille lit
  « ce pays relève de telle division ». Une même division vaut donc pour des
  dizaines de pays, et se matérialise par autant de lignes — ce que l'unicité
  autorise, puisqu'elle porte sur le COUPLE (pays_id, code) et non sur le code
  seul.

  LIBELLÉ : le fichier n'en donne pas. La feuille `COUNTRY_DIVISION` associe
  bien chaque division à des usines (SS11 → SS11 Abidjan et SS21 Togo), mais
  c'est une correspondance vers des sites, pas un nom de division. Les lignes
  reçoivent donc leur code comme libellé, comme les directions de la 0060.

  NON REPRIS : la 4e colonne de la feuille porte des noms de personnes (Abbas,
  Nader, Mohammad El Abad…) sur 9 pays. Aucun champ ne les accueille, et leur
  rôle n'est pas documenté — les inscrire quelque part au jugé serait pire que
  de les laisser dans le fichier.

  Les 173 autres pays de `ref_pays` restent tels quels : la feuille dit lesquels
  sont ACTIFS, elle ne demande pas de désactiver les autres.

  Idempotent : garde par NOT EXISTS sur le couple (pays, code).
*/

DECLARE @liens TABLE (pays nvarchar(20), division nvarchar(40));
INSERT INTO @liens (pays, division) VALUES
  ('ZA','SS14'), ('AL','SS12'), ('DZ','SS12'), ('AO','SS14'), ('SA','SS12'),
  ('AU','SS12'), ('BS','SS12'), ('BE','SS12'), ('BJ','SS13'), ('BW','SS12'),
  ('BF','SS12'), ('BI','SS12'), ('CM','SS13'), ('CA','SS12'), ('CO','SS12'),
  ('KM','SS12'), ('CG','SS14'), ('CI','SS11'), ('DJ','SS12'), ('EG','SS12'),
  ('AE','SS12'), ('ER','SS12'), ('ES','SS12'), ('ET','SS12'), ('FR','SS12'),
  ('GA','SS11'), ('GM','SS12'), ('GH','SS13'), ('GB','SS12'), ('GN','SS12'),
  ('GQ','SS12'), ('KE','SS14'), ('KW','SS12'), ('LS','SS12'), ('LB','SS12'),
  ('LR','SS11'), ('LY','SS12'), ('MG','SS14'), ('MW','SS12'), ('ML','SS12'),
  ('MA','SS12'), ('MR','SS12'), ('MZ','SS14'), ('NA','SS14'), ('NE','SS13'),
  ('NG','SS13'), ('OM','SS12'), ('UG','SS12'), ('PA','SS12'), ('NL','SS12'),
  ('QA','SS12'), ('CF','SS12'), ('CD','SS14'), ('RW','SS12'), ('ST','SS12'),
  ('SN','SS12'), ('SC','SS12'), ('SL','SS11'), ('SO','SS12'), ('SD','SS12'),
  ('LK','SS12'), ('SZ','SS12'), ('TZ','SS14'), ('TD','SS13'), ('TG','SS13'),
  ('TN','SS12'), ('US','SS12'), ('YE','SS12'), ('ZM','SS14'), ('ZW','SS14'),
  ('KH','SS12');

INSERT INTO dbo.ref_division (code, libelle, pays_id, est_actif)
SELECT l.division, l.division, p.id, 1
FROM @liens l
JOIN dbo.ref_pays p ON p.code = l.pays AND p.deleted_at IS NULL
WHERE NOT EXISTS (
  SELECT 1 FROM dbo.ref_division d WHERE d.pays_id = p.id AND d.code = l.division
);
GO
