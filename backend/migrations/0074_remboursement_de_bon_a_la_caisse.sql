/* ============================================================================
   Remboursement d'un bon : l'argent non dépensé revient à la caisse.
   Base : npg_gestion_caisse (SQL Server) — idempotent.

   Le cas est quotidien : un bon de 100 000 est décaissé, la dépense réelle est
   de 70 000, et 30 000 rentrent. Jusqu'ici rien ne permettait de les
   enregistrer — l'argent revenait dans le tiroir sans trace, et la charge
   restait à 100 000 alors que 70 000 seulement avaient été engagés.

   LE BON N'EST PAS RÉÉCRIT. Il garde son montant : c'est ce qui a été AUTORISÉ.
   Le remboursement se pose à côté et dit ce qui est revenu. On lit ainsi les
   trois faits — autorisé, sorti, rendu — au lieu du seul résultat.

   L'ÉCRITURE EST LE MIROIR DU DÉCAISSEMENT. Celui-ci fait DÉBIT portefeuille /
   CRÉDIT charge ; le remboursement fait DÉBIT charge / CRÉDIT caisse. La charge
   retombe donc à 70 000, et l'argent est en caisse — pas dans le portefeuille,
   décision métier du 17/08/2026 : le budget du mois reste consommé à hauteur de
   ce qui a été autorisé.
   ============================================================================ */
SET NOCOUNT ON;

/* ---- 1) Le type d'opération, contraint en base -------------------------- */

/* La contrainte énumère les types admis : y ajouter le nôtre, sinon toute
   insertion partirait en violation de CHECK. Elle est recréée en entier —
   SQL Server ne sait pas modifier une contrainte en place. */
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_trx_op_type')
BEGIN
  ALTER TABLE dbo.trx_operation DROP CONSTRAINT CK_trx_op_type;
  PRINT 'CK_trx_op_type retirée.';
END
GO

ALTER TABLE dbo.trx_operation WITH CHECK ADD CONSTRAINT CK_trx_op_type CHECK (
  type_operation IN (
    N'RECHARGE', N'DECAISSEMENT', N'TRANSFERT', N'AJUSTEMENT', N'ENCAISSEMENT',
    N'CREDIT', N'SALAIRE', N'REMBOURSEMENT_CREDIT',
    /* Retour à la caisse de ce qui n'a pas été dépensé sur un bon. */
    N'REMBOURSEMENT_BON'
  )
);
PRINT 'CK_trx_op_type recréée avec REMBOURSEMENT_BON.';
GO

/* ---- 2) La table des remboursements ------------------------------------- */

IF OBJECT_ID('dbo.trx_remboursement_bon', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.trx_remboursement_bon (
    id               BIGINT IDENTITY(1,1) NOT NULL,
    bon_id           BIGINT NOT NULL,
    /* Le sous-bon porte la caisse, la devise et le centre de coût : c'est LUI
       qui a été décaissé, pas le bon dans son ensemble. */
    sous_bon_id      BIGINT NOT NULL,
    caisse_id        BIGINT NOT NULL,
    devise_id        BIGINT NOT NULL,
    montant          DECIMAL(19,4) NOT NULL,
    motif            NVARCHAR(500) NULL,
    /* Relie les deux écritures en partie double, comme toute opération. */
    transaction_uuid UNIQUEIDENTIFIER NOT NULL,
    created_at       DATETIME2(3) NOT NULL CONSTRAINT DF_trx_remb_bon_created DEFAULT SYSUTCDATETIME(),
    created_by_id    BIGINT NULL,
    CONSTRAINT PK_trx_remboursement_bon PRIMARY KEY (id),
    CONSTRAINT FK_trx_remb_bon_bon      FOREIGN KEY (bon_id)      REFERENCES dbo.trx_bon(id),
    CONSTRAINT FK_trx_remb_bon_sousbon  FOREIGN KEY (sous_bon_id) REFERENCES dbo.trx_sous_bon(id),
    CONSTRAINT FK_trx_remb_bon_caisse   FOREIGN KEY (caisse_id)   REFERENCES dbo.fin_caisse(id),
    CONSTRAINT FK_trx_remb_bon_devise   FOREIGN KEY (devise_id)   REFERENCES dbo.fin_devise(id),
    /* Un remboursement de zéro ou négatif n'a aucun sens : ce serait un
       décaissement déguisé, qui échapperait à tous ses contrôles. */
    CONSTRAINT CK_trx_remb_bon_montant  CHECK (montant > 0)
  );
  PRINT 'Table dbo.trx_remboursement_bon créée.';
END
ELSE
  PRINT 'Table dbo.trx_remboursement_bon déjà présente.';
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_trx_remb_bon_sous_bon')
BEGIN
  /* Le service somme les remboursements d'un sous-bon avant d'en accepter un
     nouveau : on ne rend pas plus qu'on n'a reçu. */
  CREATE INDEX IX_trx_remb_bon_sous_bon ON dbo.trx_remboursement_bon(sous_bon_id);
  PRINT 'IX_trx_remb_bon_sous_bon créé.';
END
GO

/* ---- 3) La permission --------------------------------------------------- */

IF NOT EXISTS (SELECT 1 FROM dbo.sec_permission WHERE code = 'BON_REMBOURSER')
BEGIN
  INSERT INTO dbo.sec_permission (code, libelle, module, description, est_actif)
  VALUES (
    'BON_REMBOURSER',
    'Enregistrer un remboursement de bon',
    'TRANSACTIONNEL',
    'Rendre à la caisse la part non dépensée d''un bon décaissé.',
    1
  );
  PRINT 'Permission BON_REMBOURSER créée.';
END
ELSE
  PRINT 'Permission BON_REMBOURSER déjà présente.';
GO

/* Le caissier reçoit l'argent : c'est lui qui l'enregistre. Les administrateurs
   l'obtiennent aussi — ils décaissent déjà. */
INSERT INTO dbo.sec_role_permission (role_id, permission_id)
SELECT r.id, p.id
  FROM dbo.sec_role r
 CROSS JOIN dbo.sec_permission p
 WHERE p.code = 'BON_REMBOURSER'
   AND r.code IN ('CAISSIER', 'ADMINISTRATEUR', 'SUPER_ADMIN')
   AND NOT EXISTS (
     SELECT 1 FROM dbo.sec_role_permission x
      WHERE x.role_id = r.id AND x.permission_id = p.id
   );

PRINT CONCAT('Rôles ayant reçu BON_REMBOURSER : ', @@ROWCOUNT);
GO
