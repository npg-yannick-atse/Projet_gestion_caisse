/*
  Retire la catégorie des profils.

  `sec_profil.categorie` — VALIDATEUR / DEMANDEUR / CAISSIER / INTERIM — ne
  décidait de RIEN. Vérifié le 13/08/2026 sur l'ensemble du code : aucune ligne
  du serveur ne la lit. Elle ne donnait aucun droit, n'en retirait aucun, et ne
  restreignait pas à qui le profil pouvait être attribué. Un profil rangé en
  DEMANDEUR mais garni de permissions de caissier se comportait exactement comme
  un profil CAISSIER.

  Ses seuls usages étaient décoratifs : une pastille colorée, une colonne
  triable, un rappel entre parenthèses dans la fiche utilisateur. Le champ était
  pourtant OBLIGATOIRE à la création — il forçait donc un choix arbitraire, dont
  la seule conséquence possible était d'induire en erreur. Les deux profils
  existants en témoignaient : « Profile_Validateur_01 » était rangé en DEMANDEUR.

  Un champ qui ne peut que tromper vaut moins que pas de champ du tout.
*/

IF COL_LENGTH('dbo.sec_profil', 'categorie') IS NOT NULL
BEGIN
  /*
    Les contraintes portées par la colonne doivent tomber d'abord : SQL Server
    refuse de supprimer une colonne encore référencée par un DEFAULT ou un CHECK.
  */
  DECLARE @contrainte sysname;

  SELECT @contrainte = dc.name
    FROM sys.default_constraints dc
    JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
   WHERE dc.parent_object_id = OBJECT_ID('dbo.sec_profil') AND c.name = 'categorie';
  IF @contrainte IS NOT NULL
    EXEC('ALTER TABLE dbo.sec_profil DROP CONSTRAINT ' + @contrainte);

  SELECT @contrainte = cc.name
    FROM sys.check_constraints cc
    JOIN sys.columns c ON c.object_id = cc.parent_object_id AND c.column_id = cc.parent_column_id
   WHERE cc.parent_object_id = OBJECT_ID('dbo.sec_profil') AND c.name = 'categorie';
  IF @contrainte IS NOT NULL
    EXEC('ALTER TABLE dbo.sec_profil DROP CONSTRAINT ' + @contrainte);

  ALTER TABLE dbo.sec_profil DROP COLUMN categorie;
END
GO
