/* ============================================================================
   Permissions du module EMPLOYE
   Base : npg_gestion_caisse (SQL Server) — idempotent.

   EMPLOYE_VOIR_SALAIRE : voir le salaire d'un employé. Sans cette permission,
   le champ salaire est retiré de la réponse serveur (et pas seulement masqué
   à l'écran) — la valeur ne transite donc jamais sur le réseau.

   ATTENTION : les administrateurs (SUPER_ADMIN / ADMINISTRATEUR / DAF) passent
   d'office toutes les permissions (AuthorizationService.assertPermission court-
   circuite via isAdmin). Ils verront donc le salaire quoi qu'il arrive. Pour le
   masquer même à un ADMINISTRATEUR, il faudrait un contrôle dédié hors de ce
   mécanisme.

   Assignée ici uniquement au DAF + admins. À élargir via le back-office
   (rôles / profils / permissions extra) selon les besoins RH.
   ============================================================================ */
SET NOCOUNT ON;

IF NOT EXISTS (SELECT 1 FROM dbo.sec_permission WHERE code = N'EMPLOYE_VOIR_SALAIRE')
    INSERT INTO dbo.sec_permission(code, libelle, module)
    VALUES (N'EMPLOYE_VOIR_SALAIRE', N'Voir le salaire des employés', N'EMPLOYE');

IF NOT EXISTS (SELECT 1 FROM dbo.sec_permission WHERE code = N'EMPLOYE_GERER')
    INSERT INTO dbo.sec_permission(code, libelle, module)
    VALUES (N'EMPLOYE_GERER', N'Créer / modifier les employés et leurs bénéfices', N'EMPLOYE');

/* Administrateurs (et DAF) : toutes les permissions, dont celles-ci. */
INSERT INTO dbo.sec_role_permission(role_id, permission_id)
SELECT r.id, p.id
FROM dbo.sec_role r
JOIN dbo.sec_permission p ON p.code IN (N'EMPLOYE_VOIR_SALAIRE', N'EMPLOYE_GERER')
WHERE r.code IN (N'SUPER_ADMIN', N'ADMINISTRATEUR', N'DAF')
  AND NOT EXISTS (
      SELECT 1 FROM dbo.sec_role_permission rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

PRINT N'Permissions EMPLOYE_VOIR_SALAIRE / EMPLOYE_GERER prêtes (admins + DAF).';
GO
