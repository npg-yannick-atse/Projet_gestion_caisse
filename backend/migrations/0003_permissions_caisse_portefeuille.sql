/* Permissions de gestion des caisses et portefeuilles (modifier / supprimer).
   La désactivation et la création sont couvertes par la permission *_MODIFIER. */
IF NOT EXISTS (SELECT 1 FROM dbo.sec_permission WHERE code = N'CAISSE_MODIFIER')
    INSERT INTO dbo.sec_permission(code, libelle, module) VALUES (N'CAISSE_MODIFIER', N'Créer / modifier / (dés)activer une caisse', N'CAISSE');
IF NOT EXISTS (SELECT 1 FROM dbo.sec_permission WHERE code = N'CAISSE_SUPPRIMER')
    INSERT INTO dbo.sec_permission(code, libelle, module) VALUES (N'CAISSE_SUPPRIMER', N'Supprimer une caisse', N'CAISSE');
IF NOT EXISTS (SELECT 1 FROM dbo.sec_permission WHERE code = N'PORTEFEUILLE_MODIFIER')
    INSERT INTO dbo.sec_permission(code, libelle, module) VALUES (N'PORTEFEUILLE_MODIFIER', N'Créer / modifier / (dés)activer un portefeuille', N'PORTEFEUILLE');
IF NOT EXISTS (SELECT 1 FROM dbo.sec_permission WHERE code = N'PORTEFEUILLE_SUPPRIMER')
    INSERT INTO dbo.sec_permission(code, libelle, module) VALUES (N'PORTEFEUILLE_SUPPRIMER', N'Supprimer un portefeuille', N'PORTEFEUILLE');
