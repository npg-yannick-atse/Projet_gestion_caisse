/* ============================================================================
   Verrou des tables de SÉCURITÉ (permissions / profils / rôles / affectations)
   Base : npg_gestion_caisse (SQL Server) — idempotent.

   Objectif : empêcher la modification DIRECTE de ces tables (depuis SSMS ou tout
   autre outil). Seule l'application, qui s'identifie sur sa connexion via
   APP_NAME() = 'fdc-backend' (cf. database.config.ts), peut y écrire. Le runtime,
   les migrations et les seeds partagent cette identité → ils passent ; toute
   autre connexion est rejetée par un trigger.

   Limites (honnêteté) :
     - Un compte sysadmin / db_owner peut désactiver un trigger : ce verrou bloque
       les éditions directes des comptes normaux, pas un DBA tout-puissant. Pour un
       blocage « dur », il faut en plus retirer les droits d'écriture SQL (DENY).
     - APP_NAME est « déclaratif » : quelqu'un qui connaît le nom peut l'usurper
       dans sa chaîne de connexion. C'est un garde-fou, pas un secret.
     - TRUNCATE ne déclenche pas de trigger DML (exige de toute façon des droits
       élevés).

   Réversible : DROP TRIGGER TR_<table>_lock sur chaque table.
   ============================================================================ */
SET NOCOUNT ON;

DECLARE @tables TABLE (name SYSNAME);
INSERT INTO @tables(name) VALUES
    (N'sec_permission'),
    (N'sec_role'),
    (N'sec_role_permission'),
    (N'sec_profil'),
    (N'sec_profil_permission'),
    (N'sec_user_role'),
    (N'sec_user_profil'),
    (N'sec_user_permission_extra');

DECLARE @t SYSNAME, @sql NVARCHAR(MAX);
DECLARE cur CURSOR LOCAL FAST_FORWARD FOR SELECT name FROM @tables;
OPEN cur;
FETCH NEXT FROM cur INTO @t;
WHILE @@FETCH_STATUS = 0
BEGIN
    -- (Re)création idempotente du trigger de blocage.
    SET @sql = N'IF OBJECT_ID(N''dbo.TR_' + @t + N'_lock'', N''TR'') IS NOT NULL DROP TRIGGER dbo.TR_' + @t + N'_lock;';
    EXEC sys.sp_executesql @sql;

    SET @sql =
        N'CREATE TRIGGER dbo.TR_' + @t + N'_lock ON dbo.' + @t + N'
          AFTER INSERT, UPDATE, DELETE AS
          BEGIN
              SET NOCOUNT ON;
              IF APP_NAME() <> N''fdc-backend''
              BEGIN
                  ROLLBACK TRANSACTION;
                  THROW 50001, N''Modification directe interdite sur une table de securite. Passez par le service applicatif Fond de Caisse.'', 1;
              END
          END';
    EXEC sys.sp_executesql @sql;

    PRINT N'Trigger de blocage posé sur dbo.' + @t;
    FETCH NEXT FROM cur INTO @t;
END
CLOSE cur;
DEALLOCATE cur;

PRINT N'Migration 0025 (verrou tables de sécurité) terminée.';
GO
