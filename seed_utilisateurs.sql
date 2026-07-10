/* ============================================================================
   Utilisateurs NPG (matricule réel = clé LDAP)
   Base : npg_gestion_caisse (SQL Server)
   Idempotent : n'insère que si matricule/email pas déjà présents.

   Connexion :
     - LDAP actif (LDAP_ENABLED=true)  -> login par username (imad.ghamloush) ;
       le LDAP renvoie le matricule, qui doit correspondre à la valeur ci-dessous.
     - Mode local (LDAP_ENABLED=false) -> login par MATRICULE (ex. 2559) ou EMAIL,
       avec n'importe quel mot de passe.
   ============================================================================ */
SET NOCOUNT ON;

DECLARE @u TABLE (matricule NVARCHAR(50), prenom NVARCHAR(100), nom NVARCHAR(100), email NVARCHAR(200));

INSERT INTO @u (matricule, prenom, nom, email) VALUES
    (N'2559', N'Imad',    N'Ghamloush', N'imad.ghamloush@npgandour.com'),
    (N'4142', N'Yannick', N'Atse',      N'yannick.atse@npgandour.com'),
    (N'4076', N'Ange',    N'Madou',     N'ange.madou@npgandour.com'),
    (N'4201', N'Wael',    N'Trabulsi',  N'wael.trabulsi@npgandour.com');

INSERT INTO dbo.sec_user
    (uuid, matricule, nom, prenom, email, mot_de_passe_hash, est_actif, acces_web, acces_mobile)
SELECT NEWID(), u.matricule, u.nom, u.prenom, u.email, N'(ldap)', 1, 1, 1
FROM @u u
WHERE NOT EXISTS (SELECT 1 FROM dbo.sec_user s WHERE s.matricule = u.matricule)
  AND NOT EXISTS (SELECT 1 FROM dbo.sec_user s WHERE s.email = u.email);

PRINT N'Utilisateurs NPG créés (ceux déjà présents sont ignorés).';
GO
