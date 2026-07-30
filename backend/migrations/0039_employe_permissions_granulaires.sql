/* ============================================================================
   Permissions granulaires du module EMPLOYE (sécurisation)
   Base : npg_gestion_caisse (SQL Server) — idempotent.

   Découpe l'ancien droit fourre-tout EMPLOYE_GERER en permissions PAR OPÉRATION,
   pour pouvoir dire précisément « peut créer/modifier mais pas supprimer », etc.

     - EMPLOYE_VOIR      : consulter la liste / le détail des employés (+ export).
     - EMPLOYE_CREER     : créer / importer des employés.
     - EMPLOYE_MODIFIER  : modifier un employé.
     - EMPLOYE_SUPPRIMER : désactiver (supprimer) un employé.

   Attribuées à SUPER_ADMIN / ADMINISTRATEUR / DAF (le DAF n'étant PAS admin au
   sens du bypass, il a besoin de l'attribution explicite). EMPLOYE_GERER reste
   en place pour les bénéfices / types de bénéfice. EMPLOYE_VOIR_SALAIRE inchangé.
   ============================================================================ */
SET NOCOUNT ON;

INSERT INTO dbo.sec_permission(code, libelle, module)
SELECT v.code, v.libelle, N'EMPLOYE'
FROM (VALUES
    (N'EMPLOYE_VOIR',      N'Consulter les employés'),
    (N'EMPLOYE_CREER',     N'Créer / importer des employés'),
    (N'EMPLOYE_MODIFIER',  N'Modifier un employé'),
    (N'EMPLOYE_SUPPRIMER', N'Supprimer un employé')
) AS v(code, libelle)
WHERE NOT EXISTS (SELECT 1 FROM dbo.sec_permission p WHERE p.code = v.code);

INSERT INTO dbo.sec_role_permission(role_id, permission_id)
SELECT r.id, p.id
FROM dbo.sec_role r
JOIN dbo.sec_permission p
  ON p.code IN (N'EMPLOYE_VOIR', N'EMPLOYE_CREER', N'EMPLOYE_MODIFIER', N'EMPLOYE_SUPPRIMER')
WHERE r.code IN (N'SUPER_ADMIN', N'ADMINISTRATEUR', N'DAF')
  AND NOT EXISTS (
      SELECT 1 FROM dbo.sec_role_permission rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

PRINT N'Migration 0039 (permissions employés granulaires) terminée.';
GO
