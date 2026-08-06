/* ============================================================================
   Suivi RÉEL des remboursements de crédit
   Base : npg_gestion_caisse (SQL Server) — idempotent.

   Jusqu'ici aucun remboursement n'était enregistré : l'écran déduisait qu'une
   mensualité était payée du simple fait que sa date d'échéance était passée. Un
   employé en retard apparaissait donc « à jour », et la question « il a déjà
   remboursé combien ? » n'avait pas de réponse vérifiable.

   Cette table enregistre chaque versement réellement encaissé. L'échéancier
   devient un constat : on distingue ce qui est dû, ce qui est versé et ce qui
   est en retard.

   Comptablement, un remboursement est l'INVERSE du décaissement du crédit :
     décaissement  → DÉBIT source        / CRÉDIT créance employé
     remboursement → DÉBIT créance employé / CRÉDIT source  (l'argent revient)
   ============================================================================ */
SET NOCOUNT ON;

/* ---------------------------------------------------------------------------
   1) Le remboursement est un type d'opération à part entière
   --------------------------------------------------------------------------- */
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_trx_op_type')
    ALTER TABLE dbo.trx_operation DROP CONSTRAINT CK_trx_op_type;
ALTER TABLE dbo.trx_operation ADD CONSTRAINT CK_trx_op_type CHECK (
    type_operation IN (N'RECHARGE', N'DECAISSEMENT', N'TRANSFERT', N'AJUSTEMENT',
                       N'ENCAISSEMENT', N'CREDIT', N'SALAIRE', N'REMBOURSEMENT_CREDIT')
);
GO

/* ---------------------------------------------------------------------------
   2) Table des remboursements
   --------------------------------------------------------------------------- */
IF OBJECT_ID('dbo.fin_credit_remboursement', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.fin_credit_remboursement (
        id                BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        uuid              UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_fcr_uuid DEFAULT NEWID(),
        credit_id         BIGINT NOT NULL,
        -- Rang de l'échéance couverte (1 = première mensualité). Permet de dire
        -- « il en est à son 3e mois » sans le déduire du calendrier.
        numero_echeance   INT NOT NULL,
        montant           DECIMAL(19,4) NOT NULL,
        devise_id         BIGINT NOT NULL,
        -- Où l'argent revient : la source du crédit par défaut, mais un
        -- remboursement peut être encaissé ailleurs (caisse d'un autre site).
        source_type       NVARCHAR(20) NOT NULL,
        source_id         BIGINT NOT NULL,
        -- Rattachement au grand livre (opération + écritures).
        transaction_uuid  UNIQUEIDENTIFIER NULL,
        date_remboursement DATETIME2 NOT NULL CONSTRAINT DF_fcr_date DEFAULT SYSUTCDATETIME(),
        statut            NVARCHAR(20) NOT NULL CONSTRAINT DF_fcr_statut DEFAULT N'ENCAISSE',
        commentaire       NVARCHAR(400) NULL,
        created_at        DATETIME2 NOT NULL CONSTRAINT DF_fcr_created DEFAULT SYSUTCDATETIME(),
        created_by_id     BIGINT NULL,
        updated_at        DATETIME2 NULL,
        updated_by_id     BIGINT NULL,
        deleted_at        DATETIME2 NULL,
        deleted_by_id     BIGINT NULL,
        version           INT NOT NULL CONSTRAINT DF_fcr_version DEFAULT 0,
        CONSTRAINT CK_fcr_montant  CHECK (montant > 0),
        CONSTRAINT CK_fcr_echeance CHECK (numero_echeance >= 1),
        CONSTRAINT CK_fcr_source   CHECK (source_type IN (N'CAISSE', N'PORTEFEUILLE')),
        CONSTRAINT CK_fcr_statut   CHECK (statut IN (N'ENCAISSE', N'ANNULE')),
        CONSTRAINT FK_fcr_credit   FOREIGN KEY (credit_id) REFERENCES dbo.fin_credit(id),
        CONSTRAINT FK_fcr_devise   FOREIGN KEY (devise_id) REFERENCES dbo.fin_devise(id)
    );
END
GO

/* Une échéance ne peut être encaissée qu'une fois. Les remboursements annulés
   ne comptent pas : c'est ce qui permet de corriger une saisie erronée puis de
   ressaisir la même échéance. */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_fcr_credit_echeance')
    CREATE UNIQUE INDEX UX_fcr_credit_echeance
        ON dbo.fin_credit_remboursement (credit_id, numero_echeance)
        WHERE statut = N'ENCAISSE' AND deleted_at IS NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_fcr_credit')
    CREATE INDEX IX_fcr_credit ON dbo.fin_credit_remboursement (credit_id, statut);
GO

/* ---------------------------------------------------------------------------
   3) Permission dédiée
   --------------------------------------------------------------------------- */
IF NOT EXISTS (SELECT 1 FROM dbo.sec_permission WHERE code = N'CREDIT_REMBOURSER')
    INSERT INTO dbo.sec_permission (code, libelle, module)
    VALUES (N'CREDIT_REMBOURSER', N'Enregistrer le remboursement d''un crédit', N'FINANCIER');
GO

/* Encaisser un remboursement, c'est manipuler la caisse : mêmes rôles que ceux
   qui décaissent déjà le crédit. */
INSERT INTO dbo.sec_role_permission (role_id, permission_id)
SELECT r.id, p.id
  FROM dbo.sec_role r
 CROSS JOIN dbo.sec_permission p
 WHERE p.code = N'CREDIT_REMBOURSER'
   AND r.code IN (N'SUPER_ADMIN', N'ADMINISTRATEUR', N'DAF', N'CAISSIER')
   AND NOT EXISTS (
        SELECT 1 FROM dbo.sec_role_permission rp
         WHERE rp.role_id = r.id AND rp.permission_id = p.id);
GO

/* Aucun mapping SAP à ajouter : le remboursement mouvemente les mêmes comptes
   que le décaissement du crédit (CREDIT_EMPLOYE et la source), simplement dans
   l'autre sens. `sap_compte_mapping` est indexé par type de COMPTE, pas par
   type d'opération. */

PRINT N'Migration 0048 (remboursements de crédit) terminée.';
GO
