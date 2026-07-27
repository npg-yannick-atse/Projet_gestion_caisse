/* ============================================================================
   Répare les sous-bons restés « en attente » alors que leur bon parent est ANNULE
   Base : npg_gestion_caisse (SQL Server) — idempotent.

   Contexte : avant la cascade d'annulation (bons.service.cancelBon), annuler un
   bon ne passait pas ses sous-bons à ANNULE — ils restaient CREE/VALIDE et
   s'affichaient donc « En attente » dans le détail du bon. Le code actuel casse
   déjà correctement ; ce script corrige les DONNÉES ANTÉRIEURES.

   On aligne uniquement les sous-bons ENCORE ACTIFS (non terminaux) des bons déjà
   ANNULE. Les sous-bons déjà DECAISSE / COMPTABILISE (argent réellement sorti) ne
   sont PAS touchés — exactement comme la cascade applicative.
   ============================================================================ */
SET NOCOUNT ON;

UPDATE sb
SET sb.statut = N'ANNULE',
    sb.updated_at = SYSUTCDATETIME()
FROM dbo.trx_sous_bon sb
JOIN dbo.trx_bon b ON b.id = sb.bon_id
WHERE b.statut = N'ANNULE'
  AND sb.statut NOT IN (N'DECAISSE', N'COMPTABILISE', N'ANNULE', N'REFUSE');

PRINT CONCAT(N'Sous-bons réparés (bon ANNULE) : ', @@ROWCOUNT);
GO
