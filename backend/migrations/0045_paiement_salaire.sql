/* ============================================================================
   Paiement des salaires depuis la caisse
   Base : npg_gestion_caisse (SQL Server) — idempotent.

   Ajoute un nouveau flux : verser à un employé son salaire depuis une caisse ou
   un portefeuille, avec l'écriture comptable correspondante et le suivi de ce
   qui a déjà été payé, mois par mois.

   Convention comptable retenue (miroir du crédit employé) :
       DÉBIT  la source (CAISSE / PORTEFEUILLE)  → l'argent sort
       CRÉDIT le compte SALAIRE                  → contrepartie
   À l'envoi vers SAP, l'inversion habituelle s'applique : le crédit applicatif
   devient un débit SAP, soit DÉBIT compte de salaire / CRÉDIT caisse.

   ⚠ COMPTE SAP À VALIDER PAR LA COMPTABILITÉ. On retient 42211000
   « SALAIRE PAYE EN ESPECE », le plus proche du cas d'usage. Alternatives
   présentes dans le plan PCGG : 66110000 « SALAIRES IVOIRIENS » (charge directe)
   ou 42200000 « PERSONNEL, RÉMUNÉRATIONS DUES » (extinction de dette). Le compte
   est modifiable depuis l'écran SAP sans toucher au code.
   ============================================================================ */
SET NOCOUNT ON;

/* ---------------------------------------------------------------------------
   1) Étendre les types autorisés : opération SALAIRE et compte SALAIRE
   --------------------------------------------------------------------------- */
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_trx_op_type')
    ALTER TABLE dbo.trx_operation DROP CONSTRAINT CK_trx_op_type;
ALTER TABLE dbo.trx_operation ADD CONSTRAINT CK_trx_op_type CHECK (
    type_operation IN (N'RECHARGE', N'DECAISSEMENT', N'TRANSFERT', N'AJUSTEMENT',
                       N'ENCAISSEMENT', N'CREDIT', N'SALAIRE')
);
GO

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_trx_ec_type')
    ALTER TABLE dbo.trx_ecriture_comptable DROP CONSTRAINT CK_trx_ec_type;
ALTER TABLE dbo.trx_ecriture_comptable ADD CONSTRAINT CK_trx_ec_type CHECK (
    type_compte IN (N'CAISSE', N'PORTEFEUILLE', N'GAIN_CHANGE', N'PERTE_CHANGE',
                    N'CHARGE', N'RECETTE', N'CREDIT_EMPLOYE', N'SALAIRE')
);
GO

/* ---------------------------------------------------------------------------
   2) Table des paiements
   --------------------------------------------------------------------------- */
IF OBJECT_ID('dbo.fin_paiement_salaire', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.fin_paiement_salaire (
        id                BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        uuid              UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_fps_uuid DEFAULT NEWID(),
        employe_id        BIGINT NOT NULL,
        -- Période payée, au format AAAA-MM : un salaire se paie par mois.
        periode           NVARCHAR(7) NOT NULL,
        montant           DECIMAL(19,4) NOT NULL,
        devise_id         BIGINT NOT NULL,
        -- Source des fonds : une caisse OU un portefeuille.
        source_type       NVARCHAR(20) NOT NULL,
        source_id         BIGINT NOT NULL,
        -- Rattachement au grand livre (opération + écritures).
        transaction_uuid  UNIQUEIDENTIFIER NULL,
        date_paiement     DATETIME2 NOT NULL CONSTRAINT DF_fps_date DEFAULT SYSUTCDATETIME(),
        statut            NVARCHAR(20) NOT NULL CONSTRAINT DF_fps_statut DEFAULT N'PAYE',
        commentaire       NVARCHAR(400) NULL,
        created_at        DATETIME2 NOT NULL CONSTRAINT DF_fps_created DEFAULT SYSUTCDATETIME(),
        created_by_id     BIGINT NULL,
        updated_at        DATETIME2 NULL,
        updated_by_id     BIGINT NULL,
        deleted_at        DATETIME2 NULL,
        version           INT NOT NULL CONSTRAINT DF_fps_version DEFAULT 0,
        CONSTRAINT CK_fps_montant     CHECK (montant > 0),
        CONSTRAINT CK_fps_source      CHECK (source_type IN (N'CAISSE', N'PORTEFEUILLE')),
        CONSTRAINT CK_fps_statut      CHECK (statut IN (N'PAYE', N'ANNULE')),
        CONSTRAINT CK_fps_periode     CHECK (periode LIKE N'[0-9][0-9][0-9][0-9]-[0-1][0-9]'),
        CONSTRAINT FK_fps_employe     FOREIGN KEY (employe_id) REFERENCES dbo.ref_employe(id),
        CONSTRAINT FK_fps_devise      FOREIGN KEY (devise_id)  REFERENCES dbo.fin_devise(id)
    );
END
GO

/* Un employé ne peut être payé qu'UNE FOIS par mois — les paiements annulés ne
   comptent pas, ce qui permet de corriger une erreur puis de repayer. */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_fps_employe_periode')
    CREATE UNIQUE INDEX UX_fps_employe_periode
        ON dbo.fin_paiement_salaire (employe_id, periode)
        WHERE statut = N'PAYE' AND deleted_at IS NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_fps_periode')
    CREATE INDEX IX_fps_periode ON dbo.fin_paiement_salaire (periode, statut);
GO

/* ---------------------------------------------------------------------------
   3) Permission de paiement
   --------------------------------------------------------------------------- */
INSERT INTO dbo.sec_permission(code, libelle, module)
SELECT N'SALAIRE_PAYER', N'Payer le salaire d''un employé', N'EMPLOYE'
WHERE NOT EXISTS (SELECT 1 FROM dbo.sec_permission p WHERE p.code = N'SALAIRE_PAYER');

/* Verser de l'argent est un acte de caisse : caissier + administration.
   La CONSULTATION des montants reste régie par EMPLOYE_VOIR_SALAIRE. */
INSERT INTO dbo.sec_role_permission(role_id, permission_id)
SELECT r.id, p.id
FROM dbo.sec_role r
JOIN dbo.sec_permission p ON p.code = N'SALAIRE_PAYER'
WHERE r.code IN (N'SUPER_ADMIN', N'ADMINISTRATEUR', N'DAF', N'CAISSIER')
  AND NOT EXISTS (
      SELECT 1 FROM dbo.sec_role_permission rp
      WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );
GO

/* ---------------------------------------------------------------------------
   4) Mapping SAP du nouveau type de compte
   --------------------------------------------------------------------------- */
INSERT INTO dbo.sap_compte_mapping(type_compte, compte_sap, est_actif)
SELECT N'SALAIRE', N'42211000', 1
WHERE NOT EXISTS (SELECT 1 FROM dbo.sap_compte_mapping m WHERE m.type_compte = N'SALAIRE');
GO

PRINT N'Migration 0045 (paiement des salaires) terminée.';
GO
