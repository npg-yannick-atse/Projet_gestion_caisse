/* ============================================================================
   Câblage des PERMISSIONS aux RÔLES (sec_role_permission)
   Base : npg_gestion_caisse (SQL Server) — idempotent.

   Sans ce câblage, les contrôles `assertPermission(...)` ne passent que pour les
   admins. Ce script accorde à chaque rôle ses permissions ; les administrateurs
   (et le DAF) reçoivent TOUTES les permissions.

   Les paires dont la permission ou le rôle n'existe pas encore sont simplement
   ignorées (jointure) — on peut donc le rejouer sans risque.
   ============================================================================ */
SET NOCOUNT ON;

;WITH mapping(role_code, perm_code) AS (
    SELECT rc, pc FROM (VALUES
        -- DEMANDEUR
        (N'DEMANDEUR',                 N'BON_CREER'),
        -- VALIDATEUR
        (N'VALIDATEUR',                N'BON_CREER'),
        (N'VALIDATEUR',                N'BON_VALIDER'),
        (N'VALIDATEUR',                N'BON_SIGNER'),
        (N'VALIDATEUR',                N'BON_MODIFIER_SPEC'),
        (N'VALIDATEUR',                N'BON_ANNULER'),
        (N'VALIDATEUR',                N'BON_ANNULER_VALIDE'),
        (N'VALIDATEUR',                N'EXTENSION_APPROUVER'),
        -- CAISSIER
        (N'CAISSIER',                  N'BON_CREER'),
        (N'CAISSIER',                  N'BON_DECAISSER'),
        (N'CAISSIER',                  N'BON_SIGNER'),
        (N'CAISSIER',                  N'CAISSE_OUVRIR'),
        (N'CAISSIER',                  N'CAISSE_CLOTURER'),
        (N'CAISSIER',                  N'TRANSFERT_INITIER'),
        (N'CAISSIER',                  N'PORTEFEUILLE_VOIR_TOUS'),
        -- GESTIONNAIRE_PORTEFEUILLE
        (N'GESTIONNAIRE_PORTEFEUILLE', N'BON_CREER'),
        (N'GESTIONNAIRE_PORTEFEUILLE', N'PORTEFEUILLE_MODIFIER'),
        (N'GESTIONNAIRE_PORTEFEUILLE', N'PORTEFEUILLE_VOIR_TOUS'),
        (N'GESTIONNAIRE_PORTEFEUILLE', N'EXTENSION_APPROUVER'),
        (N'GESTIONNAIRE_PORTEFEUILLE', N'TRANSFERT_INITIER'),
        (N'GESTIONNAIRE_PORTEFEUILLE', N'INTERIM_DECLARER')
    ) AS m(rc, pc)
)
INSERT INTO dbo.sec_role_permission(role_id, permission_id)
SELECT r.id, p.id
FROM mapping m
JOIN dbo.sec_role r ON r.code = m.role_code
JOIN dbo.sec_permission p ON p.code = m.perm_code
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.sec_role_permission rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
);

/* Administrateurs (et DAF) : toutes les permissions. */
INSERT INTO dbo.sec_role_permission(role_id, permission_id)
SELECT r.id, p.id
FROM dbo.sec_role r
CROSS JOIN dbo.sec_permission p
WHERE r.code IN (N'SUPER_ADMIN', N'ADMINISTRATEUR', N'DAF')
  AND NOT EXISTS (
      SELECT 1 FROM dbo.sec_role_permission rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

DECLARE @n INT = (SELECT COUNT(*) FROM dbo.sec_role_permission);
PRINT N'Câblage rôle→permission terminé. Total liaisons : ' + CAST(@n AS NVARCHAR(10));
GO
