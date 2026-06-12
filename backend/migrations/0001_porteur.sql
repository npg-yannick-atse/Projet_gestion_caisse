/* Ajout de la colonne dbo.trx_bon.porteur
   "Personne qui se présentera à la caisse" (texte libre, optionnel),
   renseignable à la création et/ou à la validation du bon. */
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.trx_bon') AND name = N'porteur'
)
    ALTER TABLE dbo.trx_bon ADD porteur NVARCHAR(255) NULL;
