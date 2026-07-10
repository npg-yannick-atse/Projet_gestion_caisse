/* ============================================================================
   Backfill : aligne le budget mensuel des portefeuilles de DIRECTION existants
   sur le budget mensuel du centre de coût de leur direction.
   Base : npg_gestion_caisse (SQL Server) — idempotent (rejouable sans risque).

   Règle métier : une direction = un centre de coût ; un portefeuille de direction
   hérite (non modifiable) du budget mensuel de ce centre de coût. La propagation
   automatique ne s'applique qu'aux futures modifications ; ce script met à niveau
   l'existant. TOP 1 protège si une direction avait plusieurs centres de coût ;
   NULL est appliqué si la direction n'a pas de centre de coût.
   ============================================================================ */
SET NOCOUNT ON;

UPDATE dbo.fin_portefeuille
SET budget_mensuel = (
      SELECT TOP 1 cc.budget_mensuel
      FROM dbo.ref_cost_center cc
      WHERE cc.direction_id = dbo.fin_portefeuille.proprietaire_id
    ),
    updated_at = SYSUTCDATETIME()
WHERE proprietaire_type = N'DIRECTION';

PRINT N'Backfill budget des portefeuilles de direction terminé (' + CAST(@@ROWCOUNT AS NVARCHAR(10)) + N' portefeuille(s)).';
GO
