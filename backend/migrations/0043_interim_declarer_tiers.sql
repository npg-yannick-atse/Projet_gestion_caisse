/* ============================================================================
   Intérims : séparer « déclarer le sien » de « déclarer celui d'un autre »
   Base : npg_gestion_caisse (SQL Server) — idempotent.

   Deux droits distincts, dans la continuité du modèle « une permission par action » :

     INTERIM_DECLARER        déclarer SON PROPRE intérim (self-service).
                             Élargi ici aux rôles opérationnels : un caissier ou un
                             validateur qui part en congé doit pouvoir se faire
                             remplacer sans passer par un administrateur.
                             Pas au DEMANDEUR : il n'a pas de droits à déléguer.

     INTERIM_DECLARER_TIERS  déclarer l'intérim de QUELQU'UN D'AUTRE (usage
                             administrateur / RH). Réservée à l'administration.

   Les deux sont exigées en mode STRICT côté backend (aucun bypass admin), sans
   quoi les administrateurs — seuls à accéder à l'écran — passeraient de toute
   façon et les permissions ne serviraient à rien.

   Garde-fous côté code (interims.service.ts), à ne pas retirer :
     - le remplaçant ne peut pas être le créateur, sinon un administrateur
       déclarerait « initiateur = un Super Admin, remplaçant = moi » et
       obtiendrait ses droits, contournant l'interdiction de modifier ses
       propres rôles ;
     - assertCanDelegate est évalué sur l'INITIATEUR DÉSIGNÉ : on ne délègue que
       des droits que la personne remplacée détient réellement.
   ============================================================================ */
SET NOCOUNT ON;

INSERT INTO dbo.sec_permission(code, libelle, module)
SELECT N'INTERIM_DECLARER_TIERS', N'Déclarer un intérim au nom d''un autre utilisateur', N'SECURITE'
WHERE NOT EXISTS (SELECT 1 FROM dbo.sec_permission p WHERE p.code = N'INTERIM_DECLARER_TIERS');

/* 1) Déclarer pour autrui : administration uniquement.
      (DAF listé explicitement : le dépliage DAF → ADMINISTRATEUR agit sur les
       RÔLES, pas sur les permissions.) */
INSERT INTO dbo.sec_role_permission(role_id, permission_id)
SELECT r.id, p.id
FROM dbo.sec_role r
JOIN dbo.sec_permission p ON p.code = N'INTERIM_DECLARER_TIERS'
WHERE r.code IN (N'SUPER_ADMIN', N'ADMINISTRATEUR', N'DAF')
  AND NOT EXISTS (
      SELECT 1 FROM dbo.sec_role_permission rp
      WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

/* 2) Déclarer le sien : élargi aux rôles opérationnels (les admins l'ont déjà
      via la migration 0042). */
INSERT INTO dbo.sec_role_permission(role_id, permission_id)
SELECT r.id, p.id
FROM dbo.sec_role r
JOIN dbo.sec_permission p ON p.code = N'INTERIM_DECLARER'
WHERE r.code IN (N'CAISSIER', N'VALIDATEUR', N'GESTIONNAIRE_PORTEFEUILLE')
  AND NOT EXISTS (
      SELECT 1 FROM dbo.sec_role_permission rp
      WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

PRINT N'Migration 0043 (INTERIM_DECLARER élargi + INTERIM_DECLARER_TIERS) terminée.';
GO
