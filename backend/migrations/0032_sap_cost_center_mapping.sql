-- 0032_sap_cost_center_mapping.sql
-- Mapping des CENTRES DE COÛT : centre de coût de l'appli → centre de coût SAP.
-- Les codes de l'appli (ex. 22100-DSI, 1-DBTSI…) n'existent pas tels quels en SAP :
-- ce mapping traduit vers le vrai centre SAP au moment du posting. Non renseigné =
-- on n'envoie pas de centre de coût (évite l'erreur « centre inexistant »).

IF OBJECT_ID('dbo.sap_cost_center_mapping', 'U') IS NULL
  CREATE TABLE dbo.sap_cost_center_mapping (
    id               BIGINT IDENTITY(1,1) PRIMARY KEY,
    cost_center_app  NVARCHAR(50) NOT NULL UNIQUE,
    cost_center_sap  NVARCHAR(20) NULL,
    est_actif        BIT NOT NULL CONSTRAINT DF_sap_ccmap_actif DEFAULT 1,
    created_at       DATETIME2(3) NOT NULL CONSTRAINT DF_sap_ccmap_created DEFAULT SYSUTCDATETIME(),
    updated_at       DATETIME2(3) NULL
  );
GO

-- Pré-remplit les lignes avec les centres de coût existants de l'appli (à mapper).
MERGE dbo.sap_cost_center_mapping AS t
USING (SELECT DISTINCT code FROM dbo.ref_cost_center WHERE code IS NOT NULL AND code <> '') AS s(code)
ON t.cost_center_app = s.code
WHEN NOT MATCHED THEN INSERT (cost_center_app) VALUES (s.code);
GO
