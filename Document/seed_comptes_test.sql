/* ============================================================================
   Comptes de test — olivia.gbocho1..3 et sara.goli1..3
   Base : npg_gestion_caisse (SQL Server)
   Idempotent : n'insère un compte que s'il n'existe pas déjà (clé = matricule).

   NB : le login passe par le LDAP NPG (le mot de passe local n'est pas utilisé).
        Ces comptes ne pourront se connecter que s'ils existent aussi côté LDAP.
        Le matricule = identifiant de connexion (fallback quand le LDAP n'en renvoie pas).
   ============================================================================ */
SET NOCOUNT ON;

DECLARE @users TABLE (
    matricule NVARCHAR(50),
    prenom    NVARCHAR(100),
    nom       NVARCHAR(100),
    email     NVARCHAR(200)
);

INSERT INTO @users (matricule, prenom, nom, email) VALUES
    (N'olivia.gbocho1', N'Olivia', N'Gbocho 1', N'olivia.gbocho1@npgandour.com'),
    (N'olivia.gbocho2', N'Olivia', N'Gbocho 2', N'olivia.gbocho2@npgandour.com'),
    (N'olivia.gbocho3', N'Olivia', N'Gbocho 3', N'olivia.gbocho3@npgandour.com'),
    (N'sara.goli1',     N'Sara',   N'Goli 1',   N'sara.goli1@npgandour.com'),
    (N'sara.goli2',     N'Sara',   N'Goli 2',   N'sara.goli2@npgandour.com'),
    (N'sara.goli3',     N'Sara',   N'Goli 3',   N'sara.goli3@npgandour.com');

INSERT INTO dbo.sec_user
    (uuid, matricule, nom, prenom, email, mot_de_passe_hash, est_actif, acces_web, acces_mobile)
SELECT NEWID(), u.matricule, u.nom, u.prenom, u.email, N'(ldap)', 1, 1, 1
FROM @users u
WHERE NOT EXISTS (SELECT 1 FROM dbo.sec_user s WHERE s.matricule = u.matricule)
  AND NOT EXISTS (SELECT 1 FROM dbo.sec_user s WHERE s.email = u.email);

PRINT N'Comptes de test créés (ceux déjà présents sont ignorés).';
GO
