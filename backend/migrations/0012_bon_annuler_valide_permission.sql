/* ============================================================================
   Permission BON_ANNULER_VALIDE (annulation d'un bon DÉJÀ VALIDÉ)
   Base : npg_gestion_caisse (SQL Server) — idempotent.

   Règle : un demandeur peut annuler SON bon tant qu'il est au statut CREE.
   Une fois le bon VALIDÉ, l'annulation requiert cette permission (les admins
   passent). Un demandeur « pur » ne l'a pas → il ne peut plus annuler un bon
   validé. Assignée par défaut au VALIDATEUR ; assignable à d'autres rôles ou
   profils via le back-office.
   ============================================================================ */
SET NOCOUNT ON;

IF NOT EXISTS (SELECT 1 FROM dbo.sec_permission WHERE code = N'BON_ANNULER_VALIDE')
    INSERT INTO dbo.sec_permission(code, libelle, module)
    VALUES (N'BON_ANNULER_VALIDE', N'Annuler un bon déjà validé', N'BON');

/* VALIDATEUR reçoit la permission. */
INSERT INTO dbo.sec_role_permission(role_id, permission_id)
SELECT r.id, p.id
FROM dbo.sec_role r
JOIN dbo.sec_permission p ON p.code = N'BON_ANNULER_VALIDE'
WHERE r.code = N'VALIDATEUR'
  AND NOT EXISTS (
      SELECT 1 FROM dbo.sec_role_permission rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

/* Administrateurs (et DAF) : toutes les permissions, dont celle-ci. */
INSERT INTO dbo.sec_role_permission(role_id, permission_id)
SELECT r.id, p.id
FROM dbo.sec_role r
JOIN dbo.sec_permission p ON p.code = N'BON_ANNULER_VALIDE'
WHERE r.code IN (N'SUPER_ADMIN', N'ADMINISTRATEUR', N'DAF')
  AND NOT EXISTS (
      SELECT 1 FROM dbo.sec_role_permission rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

PRINT N'Permission BON_ANNULER_VALIDE prête (VALIDATEUR + admins).';
GO
