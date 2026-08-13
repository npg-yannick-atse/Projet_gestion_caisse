/* ============================================================================
   Permission DEVISE_GERER : créer et modifier les devises du référentiel.
   Base : npg_gestion_caisse (SQL Server) — idempotent.

   Jusqu'ici aucune route n'existait : les trois devises (XOF, EUR, USD) avaient
   été insérées directement en base, et aucune migration ne sait les recréer.
   Ajouter une devise exigeait donc un accès SQL en production.

   La permission est exigée en mode STRICT (les administrateurs ne la
   contournent pas), car le nombre de décimales d'une devise gouverne l'arrondi
   de toutes les conversions vers elle — et cet arrondi est figé dans les
   écritures. Le service verrouille d'ailleurs ce champ dès la première écriture.
   ============================================================================ */
SET NOCOUNT ON;

IF NOT EXISTS (SELECT 1 FROM dbo.sec_permission WHERE code = N'DEVISE_GERER')
    INSERT INTO dbo.sec_permission(code, libelle, module)
    VALUES (N'DEVISE_GERER', N'Créer et modifier les devises', N'REFERENTIEL');

/* Accord par défaut : administrateurs uniquement. Le référentiel monétaire
   n'est pas un réglage courant — un caissier n'a pas à y toucher. */
INSERT INTO dbo.sec_role_permission(role_id, permission_id)
SELECT r.id, p.id
FROM dbo.sec_role r
CROSS JOIN dbo.sec_permission p
WHERE r.code IN (N'SUPER_ADMIN', N'ADMINISTRATEUR')
  AND p.code = N'DEVISE_GERER'
  AND NOT EXISTS (
      SELECT 1 FROM dbo.sec_role_permission rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );
PRINT N'Permission DEVISE_GERER créée et accordée aux administrateurs.';
GO
