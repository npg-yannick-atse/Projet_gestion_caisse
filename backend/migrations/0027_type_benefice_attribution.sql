-- 0027_type_benefice_attribution.sql
-- Rend l'attribution des bénéfices CONFIGURABLE PAR TYPE.
-- Chaque type de bénéfice porte désormais son propre « mode d'attribution » :
--   - mode_montant : comment le montant est déterminé (saisi / fixe / % du salaire) ;
--   - montant_fixe / pourcentage_salaire : valeurs utilisées selon le mode ;
--   - plafond_pourcentage_salaire : plafond en % du salaire (tous modes) ;
--   - jour_min_mois : attribution autorisée seulement à partir de ce jour du mois ;
--   - requiert_periode : le bénéfice a-t-il une période (dates début/fin) ;
--   - recurrent : ponctuel (0) ou récurrent (1).
-- Ces réglages remplacent les règles « AVANCE » jusqu'ici codées en dur.

IF COL_LENGTH('dbo.ref_type_benefice', 'mode_montant') IS NULL
  ALTER TABLE dbo.ref_type_benefice ADD mode_montant NVARCHAR(20) NOT NULL
    CONSTRAINT DF_rtb_mode_montant DEFAULT 'SAISI';
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_rtb_mode_montant')
  ALTER TABLE dbo.ref_type_benefice ADD CONSTRAINT CK_rtb_mode_montant
    CHECK (mode_montant IN ('SAISI', 'FIXE', 'POURCENTAGE_SALAIRE'));
GO
IF COL_LENGTH('dbo.ref_type_benefice', 'montant_fixe') IS NULL
  ALTER TABLE dbo.ref_type_benefice ADD montant_fixe DECIMAL(19, 4) NULL;
GO
IF COL_LENGTH('dbo.ref_type_benefice', 'pourcentage_salaire') IS NULL
  ALTER TABLE dbo.ref_type_benefice ADD pourcentage_salaire DECIMAL(5, 2) NULL;
GO
IF COL_LENGTH('dbo.ref_type_benefice', 'plafond_pourcentage_salaire') IS NULL
  ALTER TABLE dbo.ref_type_benefice ADD plafond_pourcentage_salaire DECIMAL(5, 2) NULL;
GO
IF COL_LENGTH('dbo.ref_type_benefice', 'jour_min_mois') IS NULL
  ALTER TABLE dbo.ref_type_benefice ADD jour_min_mois INT NULL;
GO
IF COL_LENGTH('dbo.ref_type_benefice', 'requiert_periode') IS NULL
  ALTER TABLE dbo.ref_type_benefice ADD requiert_periode BIT NOT NULL
    CONSTRAINT DF_rtb_requiert_periode DEFAULT 1;
GO
IF COL_LENGTH('dbo.ref_type_benefice', 'recurrent') IS NULL
  ALTER TABLE dbo.ref_type_benefice ADD recurrent BIT NOT NULL
    CONSTRAINT DF_rtb_recurrent DEFAULT 0;
GO

-- Reprise : l'« Avance sur salaire » conserve ses règles historiques
-- (à partir du 15 du mois, plafond 50 % du salaire, sans période), désormais
-- portées par le type lui-même plutôt que par du code en dur.
UPDATE dbo.ref_type_benefice
   SET jour_min_mois = COALESCE(jour_min_mois, 15),
       plafond_pourcentage_salaire = COALESCE(plafond_pourcentage_salaire, 50),
       requiert_periode = 0
 WHERE code = 'AVANCE';
GO
