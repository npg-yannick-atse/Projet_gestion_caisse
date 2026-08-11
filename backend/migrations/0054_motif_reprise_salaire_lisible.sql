/* ============================================================================
   Libellé lisible pour la reprise des salaires
   Base : npg_gestion_caisse (SQL Server) — idempotent.

   La migration 0053 a inscrit « Reprise du salaire existant (migration 0053) »
   dans le motif des périodes reprises. Ce texte est affiché tel quel dans la
   colonne « Motif » de la modale Salaire : un numéro de migration n'a aucun
   sens pour la personne qui consulte l'historique d'un employé.

   0053 n'est pas modifiée — elle est déjà appliquée, et on ne réécrit pas une
   migration passée. Ce correctif porte sur les données.
   ============================================================================ */
SET NOCOUNT ON;

UPDATE dbo.ref_employe_salaire
SET motif      = N'Salaire en vigueur à la mise en place du suivi',
    updated_at = SYSUTCDATETIME(),
    version    = version + 1
WHERE motif = N'Reprise du salaire existant (migration 0053)';
GO

PRINT N'Migration 0054 (libellé de reprise des salaires) terminée.';
GO
