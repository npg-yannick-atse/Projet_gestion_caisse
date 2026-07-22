/* ============================================================================
   Paramètres applicatifs + type de bénéfice AVANCE
   Base : npg_gestion_caisse (SQL Server) — idempotent.

   1) Table clé/valeur `app_parametre` pour les réglages globaux modifiables via
      le back-office (sans redéploiement).
   2) Réglages de l'AVANCE sur salaire :
        - AVANCE_JOUR_MIN         : jour du mois à partir duquel une avance est
                                    possible (défaut 15).
        - AVANCE_POURCENTAGE_MAX  : part maximale du salaire (défaut 50 %).
   3) Type de bénéfice AVANCE (code repère sur lequel s'appliquent ces règles).
   ============================================================================ */
SET NOCOUNT ON;

IF OBJECT_ID(N'dbo.app_parametre', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.app_parametre (
        cle           NVARCHAR(100) NOT NULL,
        valeur        NVARCHAR(400) NULL,
        libelle       NVARCHAR(200) NULL,
        updated_at    DATETIME2(3) NOT NULL CONSTRAINT DF_app_param_updated DEFAULT SYSUTCDATETIME(),
        updated_by_id BIGINT NULL,
        CONSTRAINT PK_app_parametre PRIMARY KEY CLUSTERED (cle)
    );
    PRINT N'Table app_parametre créée.';
END

INSERT INTO dbo.app_parametre(cle, valeur, libelle)
SELECT v.cle, v.valeur, v.libelle
FROM (VALUES
    (N'AVANCE_JOUR_MIN',        N'15', N'Avance : jour du mois à partir duquel elle est autorisée'),
    (N'AVANCE_POURCENTAGE_MAX', N'50', N'Avance : pourcentage maximal du salaire')
) AS v(cle, valeur, libelle)
WHERE NOT EXISTS (SELECT 1 FROM dbo.app_parametre p WHERE p.cle = v.cle);

/* Type de bénéfice AVANCE (règles spéciales attachées à ce code). */
INSERT INTO dbo.ref_type_benefice(code, libelle)
SELECT N'AVANCE', N'Avance sur salaire'
WHERE NOT EXISTS (SELECT 1 FROM dbo.ref_type_benefice t WHERE t.code = N'AVANCE');

PRINT N'Migration 0020 (paramètres + type AVANCE) terminée.';
GO
