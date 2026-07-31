/* ============================================================================
   Permission manquante : BON_ANNULER
   Base : npg_gestion_caisse (SQL Server) — idempotent.

   Correction d'une incohérence détectée en croisant les codes vérifiés dans le
   code avec le contenu de sec_permission :

     bons.service.ts (annulation) exige BON_ANNULER pour annuler le bon d'un AUTRE
     utilisateur, mais cette permission n'a jamais été créée en base. Résultat :
     la vérification échouait toujours et SEULS les administrateurs (qui passent
     par le bypass admin) pouvaient annuler le bon d'autrui — le droit était donc
     impossible à déléguer.

   Attribution volontairement IDENTIQUE au comportement observé jusqu'ici
   (administrateurs uniquement) : on rend le droit délégable sans l'élargir.
   Pour autoriser un validateur à annuler le bon d'un autre, il suffit désormais
   de lui attribuer BON_ANNULER (rôle, profil ou permission extra).
   ============================================================================ */
SET NOCOUNT ON;

INSERT INTO dbo.sec_permission(code, libelle, module)
SELECT N'BON_ANNULER', N'Annuler le bon d''un autre utilisateur', N'BON'
WHERE NOT EXISTS (SELECT 1 FROM dbo.sec_permission p WHERE p.code = N'BON_ANNULER');

INSERT INTO dbo.sec_role_permission(role_id, permission_id)
SELECT r.id, p.id
FROM dbo.sec_role r
JOIN dbo.sec_permission p ON p.code = N'BON_ANNULER'
WHERE r.code IN (N'SUPER_ADMIN', N'ADMINISTRATEUR')
  AND NOT EXISTS (
      SELECT 1 FROM dbo.sec_role_permission rp
      WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

PRINT N'Migration 0041 (permission BON_ANNULER) terminée.';
GO
