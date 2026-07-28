-- 0030_sap_mapping.sql
-- Mapping comptable : à chaque TYPE DE COMPTE de l'appli (CAISSE, RECETTE, CHARGE…)
-- on associe le COMPTE GÉNÉRAL SAP (plan PCGG) à utiliser au posting.
-- Permet d'envoyer les opérations à SAP sans compte GL sur chaque écriture.

IF OBJECT_ID('dbo.sap_compte_mapping', 'U') IS NULL
  CREATE TABLE dbo.sap_compte_mapping (
    id           BIGINT IDENTITY(1,1) PRIMARY KEY,
    type_compte  NVARCHAR(20) NOT NULL UNIQUE,
    compte_sap   NVARCHAR(20) NULL,
    est_actif    BIT NOT NULL CONSTRAINT DF_sap_map_actif DEFAULT 1,
    created_at   DATETIME2(3) NOT NULL CONSTRAINT DF_sap_map_created DEFAULT SYSUTCDATETIME(),
    updated_at   DATETIME2(3) NULL
  );
GO

-- Pré-crée les lignes pour les types de compte connus (compte SAP à renseigner).
MERGE dbo.sap_compte_mapping AS t
USING (VALUES
  (N'CAISSE'), (N'PORTEFEUILLE'), (N'RECETTE'), (N'CHARGE'),
  (N'CREDIT_EMPLOYE'), (N'GAIN_CHANGE'), (N'PERTE_CHANGE')
) AS s(tc)
ON t.type_compte = s.tc
WHEN NOT MATCHED THEN INSERT (type_compte) VALUES (s.tc);
GO
