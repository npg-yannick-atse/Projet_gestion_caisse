/* ============================================================================
   Décomposition de la clé de pièce SAP sur trx_operation
   Base : npg_gestion_caisse (SQL Server) — idempotent.

   La BAPI renvoie une clé de référence (OBJ_KEY / AWKEY) concaténée sur 18
   caractères, stockée telle quelle dans sap_piece :

       0100351478  2251  2026
       └─ pièce ─┘ └soc┘ └exer┘
          10 car.   4 c.  4 c.

   On la ventile ici en trois colonnes pour pouvoir rechercher, trier et
   rapprocher sans découper la chaîne à chaque requête.

   sap_piece est CONSERVÉE : c'est cette forme concaténée que SAP attend en
   entrée de BAPI_ACC_DOCUMENT_REV_POST (REVERSAL.OBJ_KEY) pour contrepasser.
   Les trois colonnes sont donc une COMMODITÉ DE LECTURE, pas un remplacement.

   Reprise de l'existant : uniquement les clés de longueur 18 (format BKPFF).
   Une clé d'une autre longueur reste non décomposée plutôt que d'être
   découpée au hasard.
   ============================================================================ */
SET NOCOUNT ON;

IF COL_LENGTH('dbo.trx_operation', 'sap_numero_piece') IS NULL
    ALTER TABLE dbo.trx_operation ADD sap_numero_piece NVARCHAR(10) NULL;

IF COL_LENGTH('dbo.trx_operation', 'sap_societe') IS NULL
    ALTER TABLE dbo.trx_operation ADD sap_societe NVARCHAR(4) NULL;

IF COL_LENGTH('dbo.trx_operation', 'sap_exercice') IS NULL
    ALTER TABLE dbo.trx_operation ADD sap_exercice NVARCHAR(4) NULL;
GO

/* Reprise des pièces déjà envoyées. */
UPDATE dbo.trx_operation
   SET sap_numero_piece = LEFT(sap_piece, 10),
       sap_societe      = SUBSTRING(sap_piece, 11, 4),
       sap_exercice     = SUBSTRING(sap_piece, 15, 4)
 WHERE sap_piece IS NOT NULL
   AND LEN(sap_piece) = 18
   AND sap_numero_piece IS NULL;
GO

/* Recherche par numéro de pièce (le cas d'usage : « retrouve-moi la pièce X »). */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_trx_operation_sap_piece_decomposee')
    CREATE INDEX IX_trx_operation_sap_piece_decomposee
        ON dbo.trx_operation (sap_numero_piece, sap_societe, sap_exercice)
        WHERE sap_numero_piece IS NOT NULL;
GO

PRINT N'Migration 0044 (décomposition de la clé de pièce SAP) terminée.';
GO
