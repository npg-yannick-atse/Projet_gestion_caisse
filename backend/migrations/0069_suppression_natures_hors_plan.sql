/* ============================================================================
   Suppression des deux natures qui ne viennent pas du plan comptable.
   Base : npg_gestion_caisse (SQL Server) — idempotent.

   `ref_nature_operation` n'est pas un référentiel propre : c'est le miroir des
   natures comptables utilisables sur un bon, alimenté par la synchronisation
   SAP (sap.service, INSERT depuis ref_nature_comptable). Ses codes sont donc
   des codes comptables — 62121000, 60110001…

   Deux lignes y échappaient, créées à la main avant cette mécanique :

     RECHARGE        « RECHARGEMENT INTERNET »  → nature comptable 1083
     ACHAT_MATERIEL  « ACHAT FLACON »           → AUCUNE nature comptable

   La seconde est la plus gênante : sans compte comptable, une dépense imputée
   dessus n'aurait jamais pu partir vers SAP. Elle serait restée bloquée au
   moment de l'envoi, sans que rien ne l'annonce à la saisie.

   Vérifié avant suppression : aucune des deux n'est référencée. Les sous-bons,
   les périmètres utilisateur et profil sont vides, et les deux seules liaisons
   avec un centre de coût portent sur la nature 86 (62650000).
   ============================================================================ */
SET NOCOUNT ON;

/* Garde-fou : on ne supprime que si RIEN ne s'y rattache. Si des bons ont été
   saisis entre-temps, la migration ne fait rien plutôt que de casser un lien. */
IF NOT EXISTS (
      SELECT 1 FROM dbo.trx_sous_bon sb
       JOIN dbo.ref_nature_operation n ON n.id = sb.nature_operation_id
      WHERE n.code IN (N'RECHARGE', N'ACHAT_MATERIEL')
   )
BEGIN
    DELETE l
      FROM dbo.ref_nature_operation_cost_center l
      JOIN dbo.ref_nature_operation n ON n.id = l.nature_operation_id
     WHERE n.code IN (N'RECHARGE', N'ACHAT_MATERIEL');

    DELETE FROM dbo.sec_user_nature_operation
     WHERE nature_operation_id IN (SELECT id FROM dbo.ref_nature_operation WHERE code IN (N'RECHARGE', N'ACHAT_MATERIEL'));

    DELETE FROM dbo.sec_profil_nature_operation
     WHERE nature_operation_id IN (SELECT id FROM dbo.ref_nature_operation WHERE code IN (N'RECHARGE', N'ACHAT_MATERIEL'));

    DELETE FROM dbo.ref_nature_operation WHERE code IN (N'RECHARGE', N'ACHAT_MATERIEL');

    PRINT N'Natures hors plan comptable supprimées (RECHARGE, ACHAT_MATERIEL).';
END
ELSE
    PRINT N'Suppression ignorée : un sous-bon référence encore ces natures.';
GO
