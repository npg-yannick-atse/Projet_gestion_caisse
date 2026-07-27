/* ============================================================================
   Workflow de validation du crédit employé
   Base : npg_gestion_caisse (SQL Server) — idempotent.

   Le crédit n'est plus accordé « en direct ». Nouveau circuit :
     EN_ATTENTE (demande, gestionnaire/validateur)
       → APPROUVEE (DAF)         → EN_COURS (décaissé par un caissier) → SOLDE
       → REJETEE (DAF)
       → ANNULEE (le demandeur)
   Le décaissement réel (opération CREDIT + écritures) n'a lieu qu'à l'étape
   caissier (statut EN_COURS). Tout est gardé par PERMISSION.

   1) Contrainte de statut élargie aux 6 valeurs.
   2) Colonnes de workflow (validateur / décaisseur / dates / commentaire).
   3) Défaut de statut = EN_ATTENTE.
   4) Index unique « 1 crédit ACTIF par employé » (EN_ATTENTE/APPROUVEE/EN_COURS).
   5) Permissions CREDIT_DEMANDER / CREDIT_VALIDER / CREDIT_DECAISSER.
   ============================================================================ */
SET NOCOUNT ON;

/* 1) Statut : élargir la contrainte CHECK ---------------------------------- */
IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_fin_credit_statut' AND parent_object_id = OBJECT_ID(N'dbo.fin_credit')
)
    ALTER TABLE dbo.fin_credit DROP CONSTRAINT CK_fin_credit_statut;

ALTER TABLE dbo.fin_credit ADD CONSTRAINT CK_fin_credit_statut
    CHECK (statut IN (N'EN_ATTENTE', N'APPROUVEE', N'EN_COURS', N'SOLDE', N'REJETEE', N'ANNULEE'));
PRINT N'Contrainte CK_fin_credit_statut élargie au workflow.';

/* 2) Colonnes de workflow -------------------------------------------------- */
IF COL_LENGTH('dbo.fin_credit', 'validateur_id') IS NULL
    ALTER TABLE dbo.fin_credit ADD validateur_id BIGINT NULL;
IF COL_LENGTH('dbo.fin_credit', 'date_validation') IS NULL
    ALTER TABLE dbo.fin_credit ADD date_validation DATETIME2(3) NULL;
IF COL_LENGTH('dbo.fin_credit', 'commentaire_validation') IS NULL
    ALTER TABLE dbo.fin_credit ADD commentaire_validation NVARCHAR(500) NULL;
IF COL_LENGTH('dbo.fin_credit', 'decaisse_par_id') IS NULL
    ALTER TABLE dbo.fin_credit ADD decaisse_par_id BIGINT NULL;
IF COL_LENGTH('dbo.fin_credit', 'date_decaissement') IS NULL
    ALTER TABLE dbo.fin_credit ADD date_decaissement DATETIME2(3) NULL;
PRINT N'Colonnes de workflow ajoutées sur fin_credit.';

/* 3) Défaut de statut = EN_ATTENTE ----------------------------------------- */
IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = N'DF_fin_credit_statut'
           AND parent_object_id = OBJECT_ID(N'dbo.fin_credit'))
    ALTER TABLE dbo.fin_credit DROP CONSTRAINT DF_fin_credit_statut;
ALTER TABLE dbo.fin_credit ADD CONSTRAINT DF_fin_credit_statut DEFAULT (N'EN_ATTENTE') FOR statut;

/* 4) Index unique « 1 crédit ACTIF par employé » --------------------------- */
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ_fin_credit_encours'
           AND object_id = OBJECT_ID(N'dbo.fin_credit'))
    DROP INDEX UQ_fin_credit_encours ON dbo.fin_credit;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ_fin_credit_actif'
               AND object_id = OBJECT_ID(N'dbo.fin_credit'))
BEGIN
    CREATE UNIQUE INDEX UQ_fin_credit_actif
        ON dbo.fin_credit(employe_id)
        WHERE statut IN (N'EN_ATTENTE', N'APPROUVEE', N'EN_COURS');
    PRINT N'Index unique UQ_fin_credit_actif créé (1 crédit actif par employé).';
END

/* 5) Permissions du workflow ----------------------------------------------- */
IF NOT EXISTS (SELECT 1 FROM dbo.sec_permission WHERE code = N'CREDIT_DEMANDER')
    INSERT INTO dbo.sec_permission(code, libelle, module)
    VALUES (N'CREDIT_DEMANDER', N'Créer / modifier une demande de crédit employé', N'CREDIT');
IF NOT EXISTS (SELECT 1 FROM dbo.sec_permission WHERE code = N'CREDIT_VALIDER')
    INSERT INTO dbo.sec_permission(code, libelle, module)
    VALUES (N'CREDIT_VALIDER', N'Approuver / rejeter / solder un crédit employé', N'CREDIT');
IF NOT EXISTS (SELECT 1 FROM dbo.sec_permission WHERE code = N'CREDIT_DECAISSER')
    INSERT INTO dbo.sec_permission(code, libelle, module)
    VALUES (N'CREDIT_DECAISSER', N'Décaisser un crédit employé approuvé', N'CREDIT');

;WITH mapping(role_code, perm_code) AS (
    SELECT rc, pc FROM (VALUES
        (N'GESTIONNAIRE_PORTEFEUILLE', N'CREDIT_DEMANDER'),
        (N'VALIDATEUR',                N'CREDIT_DEMANDER'),
        (N'DAF',                       N'CREDIT_DEMANDER'),
        (N'DAF',                       N'CREDIT_VALIDER'),
        (N'CAISSIER',                  N'CREDIT_DECAISSER'),
        (N'DAF',                       N'CREDIT_DECAISSER')
    ) AS m(rc, pc)
)
INSERT INTO dbo.sec_role_permission(role_id, permission_id)
SELECT r.id, p.id
FROM mapping m
JOIN dbo.sec_role r ON r.code = m.role_code
JOIN dbo.sec_permission p ON p.code = m.perm_code
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.sec_role_permission rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
);

/* Les administrateurs (et DAF) bypassent déjà assertPermission, mais on accorde
   explicitement les nouvelles permissions aux rôles admin pour cohérence/traçabilité. */
INSERT INTO dbo.sec_role_permission(role_id, permission_id)
SELECT r.id, p.id
FROM dbo.sec_role r
CROSS JOIN dbo.sec_permission p
WHERE r.code IN (N'SUPER_ADMIN', N'ADMINISTRATEUR', N'DAF')
  AND p.code IN (N'CREDIT_DEMANDER', N'CREDIT_VALIDER', N'CREDIT_DECAISSER')
  AND NOT EXISTS (
      SELECT 1 FROM dbo.sec_role_permission rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

PRINT N'Migration 0024 (workflow crédit) terminée.';
GO
