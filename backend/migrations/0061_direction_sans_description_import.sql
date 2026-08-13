/*
  Retire la description posée à l'import des directions (migration 0060).

  Elle disait « Importée de l'export SAP TB03 du 13/08/2026 — libellé à
  compléter ». C'était une note de chantier, pas une information sur la
  direction : elle n'a rien à faire dans un champ que les écrans affichent.
  La trace de l'origine reste dans la migration 0060 et dans l'historique.

  Ciblé sur CE texte précis : une description saisie entre-temps par un
  administrateur ne doit pas disparaître avec.
*/

UPDATE dbo.sec_direction
   SET description = NULL,
       updated_at = SYSUTCDATETIME()
 WHERE description = N'Importée de l''export SAP TB03 du 13/08/2026 — libellé à compléter';
GO
