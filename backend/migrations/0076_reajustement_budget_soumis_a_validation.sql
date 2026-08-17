/* ============================================================================
   Le réajustement mensuel devient une DEMANDE, soumise à validation.
   Base : npg_gestion_caisse (SQL Server) — idempotent.

   Jusqu'ici le réajustement déplaçait l'argent tout seul : au premier passage
   du mois, il portait chaque portefeuille à son plafond en débitant sa caisse,
   sans que personne l'ait décidé. C'est ainsi que 999 milliards sont partis
   d'un portefeuille vers une caisse le 17/08/2026, à la surprise générale.

   Désormais il PROPOSE. Une demande est créée, les personnes désignées sont
   prévenues, et l'argent ne bouge qu'après accord explicite.

   DEUX PARAMÈTRES, modifiables sans redéploiement :
     - le JOUR du mois où les demandes sont produites ;
     - QUI est prévenu, par code de rôle.

   Le jour est stocké tel quel, sans borne haute à 28 : un « 31 » sur un mois
   de trente jours doit produire la demande le dernier jour, pas la sauter. Le
   service s'en charge — la base n'a pas à connaître le calendrier.
   ============================================================================ */
SET NOCOUNT ON;

/* ---- 1) Les paramètres --------------------------------------------------- */

IF NOT EXISTS (SELECT 1 FROM dbo.app_parametre WHERE cle = 'BUDGET_RESET_JOUR')
  INSERT INTO dbo.app_parametre (cle, valeur, libelle)
  VALUES ('BUDGET_RESET_JOUR', '1',
          'Réajustement du budget mensuel : jour du mois où la demande est produite (1-31 ; au-delà du dernier jour, le dernier jour du mois)');
GO

IF NOT EXISTS (SELECT 1 FROM dbo.app_parametre WHERE cle = 'BUDGET_RESET_NOTIFIES')
  INSERT INTO dbo.app_parametre (cle, valeur, libelle)
  VALUES ('BUDGET_RESET_NOTIFIES', 'DAF,SUPER_ADMIN,CAISSIER',
          'Réajustement du budget mensuel : codes de rôles à prévenir pour validation, séparés par des virgules');
GO

/* ---- 2) La demande ------------------------------------------------------- */

IF OBJECT_ID('dbo.trx_demande_reajustement', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.trx_demande_reajustement (
    id              BIGINT IDENTITY(1,1) NOT NULL,
    portefeuille_id BIGINT NOT NULL,
    /* 'YYYY-MM' : une seule demande par portefeuille et par mois. */
    mois            NVARCHAR(7) NOT NULL,
    /* Écart constaté, TOUJOURS positif ; le sens dit dans quel sens il va. */
    montant         DECIMAL(19,4) NOT NULL,
    sens            NVARCHAR(30) NOT NULL,
    devise_id       BIGINT NOT NULL,
    caisse_id       BIGINT NOT NULL,
    /* Solde et plafond au moment du calcul : ce que le validateur doit voir
       pour juger, sans avoir à refaire l'addition. */
    solde_constate  DECIMAL(19,4) NOT NULL,
    plafond         DECIMAL(19,4) NOT NULL,
    statut          NVARCHAR(20) NOT NULL CONSTRAINT DF_trx_dem_reaj_statut DEFAULT 'EN_ATTENTE',
    decide_par_id   BIGINT NULL,
    date_decision   DATETIME2(3) NULL,
    commentaire     NVARCHAR(500) NULL,
    /* Renseignée à l'exécution : relie la demande aux écritures produites. */
    transaction_uuid UNIQUEIDENTIFIER NULL,
    erreur          NVARCHAR(500) NULL,
    created_at      DATETIME2(3) NOT NULL CONSTRAINT DF_trx_dem_reaj_created DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_trx_demande_reajustement PRIMARY KEY (id),
    CONSTRAINT FK_trx_dem_reaj_pf     FOREIGN KEY (portefeuille_id) REFERENCES dbo.fin_portefeuille(id),
    CONSTRAINT FK_trx_dem_reaj_devise FOREIGN KEY (devise_id)       REFERENCES dbo.fin_devise(id),
    CONSTRAINT FK_trx_dem_reaj_caisse FOREIGN KEY (caisse_id)       REFERENCES dbo.fin_caisse(id),
    CONSTRAINT CK_trx_dem_reaj_montant CHECK (montant > 0),
    CONSTRAINT CK_trx_dem_reaj_sens CHECK (sens IN (N'CAISSE_VERS_PORTEFEUILLE', N'PORTEFEUILLE_VERS_CAISSE')),
    CONSTRAINT CK_trx_dem_reaj_statut CHECK (statut IN (N'EN_ATTENTE', N'APPROUVEE', N'REFUSEE', N'ECHEC'))
  );
  PRINT 'Table dbo.trx_demande_reajustement créée.';
END
ELSE
  PRINT 'Table dbo.trx_demande_reajustement déjà présente.';
GO

/* Une seule demande VIVANTE par portefeuille et par mois. Les demandes refusées
   ou en échec sortent de l'index : on doit pouvoir en reproduire une après un
   refus, sans que la précédente occupe la place pour toujours. */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_trx_dem_reaj_pf_mois')
BEGIN
  CREATE UNIQUE INDEX UX_trx_dem_reaj_pf_mois
      ON dbo.trx_demande_reajustement(portefeuille_id, mois)
   WHERE statut IN (N'EN_ATTENTE', N'APPROUVEE');
  PRINT 'UX_trx_dem_reaj_pf_mois créé.';
END
GO

/* ---- 3) La permission ---------------------------------------------------- */

IF NOT EXISTS (SELECT 1 FROM dbo.sec_permission WHERE code = 'BUDGET_REAJUSTEMENT_VALIDER')
  INSERT INTO dbo.sec_permission (code, libelle, module, description, est_actif)
  VALUES ('BUDGET_REAJUSTEMENT_VALIDER', 'Valider un réajustement de budget mensuel', 'FINANCIER',
          'Approuver ou refuser le mouvement qui porte un portefeuille à son plafond mensuel.', 1);
GO

INSERT INTO dbo.sec_role_permission (role_id, permission_id)
SELECT r.id, p.id
  FROM dbo.sec_role r
 CROSS JOIN dbo.sec_permission p
 WHERE p.code = 'BUDGET_REAJUSTEMENT_VALIDER'
   AND r.code IN ('DAF', 'ADMINISTRATEUR', 'SUPER_ADMIN')
   AND NOT EXISTS (SELECT 1 FROM dbo.sec_role_permission x WHERE x.role_id = r.id AND x.permission_id = p.id);

PRINT CONCAT('Rôles ayant reçu BUDGET_REAJUSTEMENT_VALIDER : ', @@ROWCOUNT);
GO
