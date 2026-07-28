-- 0031_grant_caisse_pf_admins.sql
-- Gouvernance « caisses & portefeuilles » : ces actions passent désormais par une
-- PERMISSION explicite, y compris pour les admins (plus de bypass). Pour ne bloquer
-- personne, on attribue explicitement toutes les permissions caisse/portefeuille aux
-- rôles SUPER_ADMIN et ADMINISTRATEUR (ils gardent ainsi leur accès, via permission).

INSERT INTO dbo.sec_role_permission (role_id, permission_id)
SELECT r.id, p.id
FROM dbo.sec_role r
CROSS JOIN dbo.sec_permission p
WHERE r.code IN (N'SUPER_ADMIN', N'ADMINISTRATEUR')
  AND p.code IN (
    N'CAISSE_MODIFIER', N'CAISSE_SUPPRIMER', N'CAISSE_OUVRIR', N'CAISSE_CLOTURER',
    N'CAISSE_PRINCIPAL_CHOISIR', N'PORTEFEUILLE_MODIFIER', N'PORTEFEUILLE_SUPPRIMER',
    N'PORTEFEUILLE_SOLDE_INITIAL', N'PORTEFEUILLE_VOIR_TOUS'
  )
  AND NOT EXISTS (
    SELECT 1 FROM dbo.sec_role_permission rp
    WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );
GO
