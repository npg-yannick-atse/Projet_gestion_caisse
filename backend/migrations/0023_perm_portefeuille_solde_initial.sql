/* ============================================================================
   Permission dédiée PORTEFEUILLE_SOLDE_INITIAL : autorise la modification du
   solde initial d'un portefeuille, distincte de PORTEFEUILLE_MODIFIER.
   Base : npg_gestion_caisse (SQL Server) — idempotent.

   Le solde initial est l'amorce du solde d'un portefeuille (solde disponible =
   amorce + écritures). Le modifier déplace rétroactivement tout l'historique :
   on le réserve donc à cette permission, accordée par défaut aux admins / DAF
   (le gestionnaire de portefeuille garde PORTEFEUILLE_MODIFIER pour le nom /
   l'activation, mais ne touche plus au montant). Le service applique en plus un
   verrou d'intégrité : modification impossible dès qu'une écriture existe.
   ============================================================================ */
SET NOCOUNT ON;

IF NOT EXISTS (SELECT 1 FROM dbo.sec_permission WHERE code = N'PORTEFEUILLE_SOLDE_INITIAL')
    INSERT INTO dbo.sec_permission(code, libelle, module)
    VALUES (N'PORTEFEUILLE_SOLDE_INITIAL', N'Modifier le solde initial d''un portefeuille', N'PORTEFEUILLE');

/* Accord par défaut : administrateurs + DAF. Les autres rôles devront se la voir
   attribuer explicitement (via Profils / Rôles) s'ils doivent y accéder. */
INSERT INTO dbo.sec_role_permission(role_id, permission_id)
SELECT r.id, p.id
FROM dbo.sec_role r
CROSS JOIN dbo.sec_permission p
WHERE r.code IN (N'SUPER_ADMIN', N'ADMINISTRATEUR', N'DAF')
  AND p.code = N'PORTEFEUILLE_SOLDE_INITIAL'
  AND NOT EXISTS (
      SELECT 1 FROM dbo.sec_role_permission rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );
PRINT N'Permission PORTEFEUILLE_SOLDE_INITIAL créée et accordée aux admins / DAF.';
GO
