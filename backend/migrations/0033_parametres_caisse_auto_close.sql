/* ============================================================================
   Paramètres de la CLÔTURE AUTOMATIQUE des caisses (pilotée depuis Paramètres).
   Base : npg_gestion_caisse (SQL Server) — idempotent.

   Remplace l'ancien réglage par variables d'environnement : le job lit désormais
   ces 3 clés en base (modifiables via la page Paramètres, sans redéploiement).
     - CAISSE_AUTO_CLOSE_ENABLED : 'true' / 'false' (activer / désactiver).
     - CAISSE_AUTO_CLOSE_HEURE   : heure de clôture (0-23), défaut 20.
     - CAISSE_AUTO_CLOSE_MINUTE  : minute de clôture (0-59), défaut 0.
   Heure de référence : Afrique/Abidjan.
   ============================================================================ */
SET NOCOUNT ON;

INSERT INTO dbo.app_parametre(cle, valeur, libelle)
SELECT v.cle, v.valeur, v.libelle
FROM (VALUES
    (N'CAISSE_AUTO_CLOSE_ENABLED', N'true', N'Clôture automatique des caisses : activée (true / false)'),
    (N'CAISSE_AUTO_CLOSE_HEURE',   N'20',   N'Clôture automatique : heure (0-23, heure Côte d''Ivoire)'),
    (N'CAISSE_AUTO_CLOSE_MINUTE',  N'0',    N'Clôture automatique : minute (0-59)')
) AS v(cle, valeur, libelle)
WHERE NOT EXISTS (SELECT 1 FROM dbo.app_parametre p WHERE p.cle = v.cle);

PRINT N'Migration 0033 (paramètres clôture auto caisses) terminée.';
GO
