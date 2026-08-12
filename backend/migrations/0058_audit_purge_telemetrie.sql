/* ============================================================================
   Purger la télémétrie du journal d'audit
   Base : npg_gestion_caisse (SQL Server) — idempotent.

   CONSTAT (12/08/2026)
   --------------------
   `POST /telemetry` est une requête mutante d'un utilisateur authentifié :
   l'intercepteur global d'audit la journalisait donc, au même titre qu'une
   création de bon. Or le frontend l'envoie toutes les quelques secondes, et le
   contrôleur écrit DÉJÀ ces événements dans les fichiers `ui-AAAA-MM-JJ.jsonl`.

   Le journal d'audit contenait ainsi 3 789 lignes dont 2 989 de télémétrie —
   79 %. Les vraies actions y étaient noyées : 22 bons créés, 15 encaissements,
   41 ouvertures de caisse. Un journal qu'on ne peut plus lire ne protège plus
   rien, et personne ne l'ouvre.

   La cause est corrigée dans `audit.interceptor.ts` (RESSOURCES_NON_AUDITEES) ;
   cette migration retire ce qui a déjà été écrit.

   POURQUOI SUPPRIMER PLUTÔT QUE FILTRER À L'AFFICHAGE
   ---------------------------------------------------
   Ces lignes ne relatent aucune décision : « untel a cliqué sur Crédits ».
   Elles n'ont pas de valeur probante, et leur seul autre exemplaire — les
   fichiers `ui-*.jsonl` — est conservé. Les garder ferait porter à chaque
   requête d'audit le coût de les écarter, indéfiniment.

   Le journal d'audit n'est PAS le grand livre : il n'a ni hash ni chaînage,
   supprimer des lignes n'en invalide aucune autre.
   ============================================================================ */
SET NOCOUNT ON;

DECLARE @avant INT = (SELECT COUNT(*) FROM dbo.aud_journal);
DECLARE @cibles INT = (SELECT COUNT(*) FROM dbo.aud_journal WHERE entite_concernee = N'telemetry');

/* Par lots : une suppression unique de plusieurs milliers de lignes tiendrait
   un verrou de table le temps de la transaction. */
WHILE EXISTS (SELECT 1 FROM dbo.aud_journal WHERE entite_concernee = N'telemetry')
BEGIN
    DELETE TOP (1000) FROM dbo.aud_journal WHERE entite_concernee = N'telemetry';
END

DECLARE @apres INT = (SELECT COUNT(*) FROM dbo.aud_journal);
PRINT N'Journal d''audit : ' + CAST(@avant AS NVARCHAR(20)) + N' lignes avant, '
    + CAST(@cibles AS NVARCHAR(20)) + N' de télémétrie retirées, '
    + CAST(@apres AS NVARCHAR(20)) + N' après.';
GO

/* --- Contrôle : plus aucune ligne de télémétrie ---------------------------- */
IF EXISTS (SELECT 1 FROM dbo.aud_journal WHERE entite_concernee = N'telemetry')
    THROW 50058, N'0058 : des lignes de télémétrie subsistent dans le journal d''audit.', 1;
GO

/* Le journal se lit par date décroissante et se filtre par entité : sans index,
   chaque consultation balaie la table entière. */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_aud_journal_date')
    CREATE INDEX IX_aud_journal_date ON dbo.aud_journal(date_action DESC);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_aud_journal_entite')
    CREATE INDEX IX_aud_journal_entite ON dbo.aud_journal(entite_concernee, date_action DESC);
GO

PRINT N'Migration 0058 (purge de la télémétrie du journal d''audit) terminée.';
GO
