/* ============================================================================
   INTERIM_DECLARER devient une permission RÉELLE
   Base : npg_gestion_caisse (SQL Server) — idempotent.

   La permission existait depuis le script d'init mais n'était vérifiée NULLE PART
   dans le code : créer un intérim ne dépendait que de l'accès à l'écran. Elle est
   désormais exigée par POST /interims, en mode STRICT (sans bypass administrateur).

   Pourquoi STRICT : les personnes qui accèdent à l'écran Intérims sont justement
   les administrateurs. Avec le bypass habituel, elles passeraient quoi qu'il
   arrive et la permission serait purement décorative — impossible de retirer le
   droit de créer à quelqu'un qui a accès à la page.

   Attribution : SUPER_ADMIN (déjà en base) + ADMINISTRATEUR + DAF, c'est-à-dire
   exactement ceux qui peuvent créer un intérim aujourd'hui via l'écran.
   → iso-comportement à l'application, puis le droit se retire rôle par rôle
     depuis l'écran Rôles.

   NB : le DAF est listé explicitement. Le dépliage DAF → ADMINISTRATEUR joue sur
   les RÔLES, pas sur les permissions (getEffectivePermissions ne déplie pas les
   méta-rôles) ; sans cette ligne, un DAF perdrait le droit de créer un intérim.
   ============================================================================ */
SET NOCOUNT ON;

-- Filet : recrée la permission si elle a disparu d'un environnement.
INSERT INTO dbo.sec_permission(code, libelle, module)
SELECT N'INTERIM_DECLARER', N'Déclarer un intérim', N'SECURITE'
WHERE NOT EXISTS (SELECT 1 FROM dbo.sec_permission p WHERE p.code = N'INTERIM_DECLARER');

INSERT INTO dbo.sec_role_permission(role_id, permission_id)
SELECT r.id, p.id
FROM dbo.sec_role r
JOIN dbo.sec_permission p ON p.code = N'INTERIM_DECLARER'
WHERE r.code IN (N'SUPER_ADMIN', N'ADMINISTRATEUR', N'DAF')
  AND NOT EXISTS (
      SELECT 1 FROM dbo.sec_role_permission rp
      WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

PRINT N'Migration 0042 (INTERIM_DECLARER exigée à la création) terminée.';
GO
