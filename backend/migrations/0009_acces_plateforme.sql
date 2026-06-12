/* Accès par plateforme : autorise la connexion au web et/ou au mobile, par utilisateur.
   Par défaut : les deux autorisés (1). Idempotent. */
IF COL_LENGTH('dbo.sec_user', 'acces_web') IS NULL
    ALTER TABLE dbo.sec_user ADD acces_web BIT NOT NULL CONSTRAINT DF_sec_user_acces_web DEFAULT 1;

IF COL_LENGTH('dbo.sec_user', 'acces_mobile') IS NULL
    ALTER TABLE dbo.sec_user ADD acces_mobile BIT NOT NULL CONSTRAINT DF_sec_user_acces_mobile DEFAULT 1;
