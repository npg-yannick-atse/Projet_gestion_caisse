/* ============================================================================
   Trois pouvoirs cessent d'être réservés aux sept rôles d'origine.
   Base : npg_gestion_caisse (SQL Server) — idempotent.

   Jusqu'ici, ces règles ne consultaient AUCUNE permission : elles lisaient le
   CODE du rôle, écrit en dur dans le programme.

     - voir les bons de tout le monde   → SUPER_ADMIN, ADMINISTRATEUR,
                                          VALIDATEUR, CAISSIER,
                                          GESTIONNAIRE_PORTEFEUILLE
     - modifier un bon                  → VALIDATEUR
     - voir toutes les demandes de recharge → CAISSIER

   Conséquence : un rôle créé depuis l'écran — donc porteur d'un code inconnu du
   programme — n'ouvrait aucun de ces pouvoirs. On pouvait lui donner
   BON_VALIDER sans qu'il voie jamais un bon à valider : le droit sans la vue.

   Ces trois règles deviennent des PERMISSIONS. Tout rôle et tout profil peut
   désormais les porter.

   RIEN NE CHANGE POUR PERSONNE : les permissions sont accordées exactement aux
   rôles qui exerçaient déjà ces pouvoirs. DAF y figure explicitement — c'est un
   méta-rôle, déplié en ADMINISTRATEUR + CAISSIER lors de la résolution des
   RÔLES, mais pas lors de celle des PERMISSIONS. L'oublier lui aurait retiré
   la vue qu'il avait.

   NON CONVERTI, volontairement :
     - le contournement administrateur (SUPER_ADMIN / ADMINISTRATEUR), qui est
       une identité et non un droit énumérable ;
     - les types d'opérations visibles au journal, et l'auto-validation d'un bon
       créé par un signataire : ces règles-là décrivent un MÉTIER, pas une
       visibilité. Les traduire en permissions demanderait de rejouer chaque
       branche, pour un gain nul sur le problème posé.
   ============================================================================ */
SET NOCOUNT ON;

IF NOT EXISTS (SELECT 1 FROM dbo.sec_permission WHERE code = N'BON_VOIR_TOUS')
    INSERT INTO dbo.sec_permission(code, libelle, module)
    VALUES (N'BON_VOIR_TOUS', N'Voir les bons de tous les demandeurs', N'TRANSACTIONNEL');

IF NOT EXISTS (SELECT 1 FROM dbo.sec_permission WHERE code = N'BON_MODIFIER')
    INSERT INTO dbo.sec_permission(code, libelle, module)
    VALUES (N'BON_MODIFIER', N'Modifier un bon au statut CREE', N'TRANSACTIONNEL');

IF NOT EXISTS (SELECT 1 FROM dbo.sec_permission WHERE code = N'RECHARGE_VOIR_TOUTES')
    INSERT INTO dbo.sec_permission(code, libelle, module)
    VALUES (N'RECHARGE_VOIR_TOUTES', N'Voir les demandes de recharge de tous', N'FINANCIER');
GO

/* --- Accords : à l'identique de ce que le code faisait, rôle par rôle. --- */

DECLARE @accords TABLE (role_code nvarchar(50), permission_code nvarchar(100));
INSERT INTO @accords (role_code, permission_code) VALUES
  -- Voir tous les bons : les cinq rôles de la liste en dur, plus DAF.
  (N'SUPER_ADMIN', N'BON_VOIR_TOUS'),
  (N'ADMINISTRATEUR', N'BON_VOIR_TOUS'),
  (N'VALIDATEUR', N'BON_VOIR_TOUS'),
  (N'CAISSIER', N'BON_VOIR_TOUS'),
  (N'GESTIONNAIRE_PORTEFEUILLE', N'BON_VOIR_TOUS'),
  (N'DAF', N'BON_VOIR_TOUS'),
  -- Modifier un bon : le validateur. Les administrateurs passent par leur
  -- contournement, qui reste en place.
  (N'VALIDATEUR', N'BON_MODIFIER'),
  -- Voir toutes les recharges : le caissier, et DAF qui le recouvre.
  (N'CAISSIER', N'RECHARGE_VOIR_TOUTES'),
  (N'DAF', N'RECHARGE_VOIR_TOUTES');

INSERT INTO dbo.sec_role_permission(role_id, permission_id)
SELECT r.id, p.id
FROM @accords a
JOIN dbo.sec_role r ON r.code = a.role_code
JOIN dbo.sec_permission p ON p.code = a.permission_code
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.sec_role_permission rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
);
GO
