/* ============================================================================
   Permission BON_ANNULER (annulation du bon d'un autre utilisateur)
   Base : npg_gestion_caisse (SQL Server) — idempotent.

   Le demandeur peut toujours annuler SON propre bon (contrôlé côté code).
   Pour annuler le bon d'un AUTRE, cette permission est requise (les admins passent).
   Assignable ensuite à un rôle ou un profil via le back-office.
   ============================================================================ */
SET NOCOUNT ON;

IF NOT EXISTS (SELECT 1 FROM dbo.sec_permission WHERE code = N'BON_ANNULER')
    INSERT INTO dbo.sec_permission(code, libelle, module)
    VALUES (N'BON_ANNULER', N'Annuler le bon d''un autre utilisateur', N'BON');

PRINT N'Permission BON_ANNULER prête (à assigner aux rôles/profils voulus).';
GO
