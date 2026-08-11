/* ============================================================================
   Le salaire devient un HISTORIQUE de périodes, comme les bénéfices
   Base : npg_gestion_caisse (SQL Server) — idempotent.

   DEMANDE MÉTIER (10/08/2026)
   ---------------------------
   `ref_employe.salaire` est une simple colonne : une seule valeur, écrasée à
   chaque augmentation ou réduction. Trois conséquences :

     1. Aucun historique — impossible de dire quel était le salaire en mars.
     2. Une augmentation RÉÉCRIT LE PASSÉ : la grille des salaires calcule ce
        qui reste dû à partir du salaire COURANT. Augmenter quelqu'un en août
        puis régler son mois de juillet impayé lui verserait le nouveau montant
        pour juillet. Le risque est réel depuis l'ajout de la vue « mois
        antérieurs ».
     3. Ce qui est DÉJÀ payé reste juste : `fin_paiement_salaire.montant` fige
        le montant au paiement. Seul le « reste dû » était faux.

   Le salaire suit donc désormais le modèle des bénéfices (`ref_employe_benefice`
   porte montant + date_debut + date_fin) : une succession de périodes. Une
   augmentation ne modifie plus rien — elle clôt la période courante et en ouvre
   une nouvelle.

   `ref_employe.salaire` EST CONSERVÉE et tenue à jour comme reflet du salaire
   courant : de nombreux écrans et exports la lisent (crédits, plafond de
   retenue, export Excel). L'historique fait foi pour un mois donné, la colonne
   reste le raccourci « combien gagne-t-il aujourd'hui ».
   ============================================================================ */
SET NOCOUNT ON;

IF OBJECT_ID('dbo.ref_employe_salaire', 'U') IS NULL
CREATE TABLE dbo.ref_employe_salaire (
    id              BIGINT IDENTITY(1,1) NOT NULL,
    employe_id      BIGINT NOT NULL,
    montant         DECIMAL(19,4) NOT NULL,
    /* Période de validité. date_fin NULL = salaire encore en vigueur. */
    date_debut      DATE NOT NULL,
    date_fin        DATE NULL,
    motif           NVARCHAR(200) NULL,
    created_at      DATETIME2(3) NOT NULL CONSTRAINT DF_ref_emp_sal_created DEFAULT SYSUTCDATETIME(),
    created_by_id   BIGINT NULL,
    updated_at      DATETIME2(3) NULL,
    updated_by_id   BIGINT NULL,
    deleted_at      DATETIME2(3) NULL,
    deleted_by_id   BIGINT NULL,
    version         INT NOT NULL CONSTRAINT DF_ref_emp_sal_version DEFAULT 1,
    CONSTRAINT PK_ref_employe_salaire PRIMARY KEY CLUSTERED (id),
    CONSTRAINT FK_ref_emp_sal_employe FOREIGN KEY (employe_id) REFERENCES dbo.ref_employe(id),
    /* Une période ne peut pas se terminer avant d'avoir commencé. */
    CONSTRAINT CK_ref_emp_sal_periode CHECK (date_fin IS NULL OR date_fin >= date_debut)
);
GO

/* Recherche par employé et par date : c'est l'accès de la grille des salaires,
   appelé une fois par employé et par mois affiché. */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ref_emp_sal_employe_debut')
    CREATE INDEX IX_ref_emp_sal_employe_debut
        ON dbo.ref_employe_salaire(employe_id, date_debut) WHERE deleted_at IS NULL;
GO

/* ----------------------------------------------------------------------------
   Reprise : chaque salaire actuel devient la première période de l'employé.

   La fiche ne porte PAS de date d'embauche : la période démarre au premier jour
   du mois d'entrée de l'employé dans l'application (`created_at`). C'est la même
   convention que la vue des arriérés — elle sous-estime plutôt que d'inventer
   une ancienneté.

   `date_fin` reste NULL : ces salaires sont ceux en vigueur aujourd'hui.
   ---------------------------------------------------------------------------- */
INSERT INTO dbo.ref_employe_salaire (employe_id, montant, date_debut, date_fin, motif, created_at)
SELECT
    e.id,
    e.salaire,
    DATEFROMPARTS(YEAR(e.created_at), MONTH(e.created_at), 1),
    NULL,
    N'Salaire en vigueur à la mise en place du suivi',
    SYSUTCDATETIME()
FROM dbo.ref_employe e
WHERE e.salaire IS NOT NULL
  AND e.salaire > 0
  AND NOT EXISTS (
      SELECT 1 FROM dbo.ref_employe_salaire s
      WHERE s.employe_id = e.id AND s.deleted_at IS NULL
  );
GO

/* --- Contrôle : aucun employé salarié ne doit rester sans période ---------- */
IF EXISTS (
    SELECT 1 FROM dbo.ref_employe e
    WHERE e.salaire IS NOT NULL AND e.salaire > 0 AND e.deleted_at IS NULL
      AND NOT EXISTS (
          SELECT 1 FROM dbo.ref_employe_salaire s
          WHERE s.employe_id = e.id AND s.deleted_at IS NULL
      )
)
    THROW 50053, N'0053 : un employé salarié n''a pas de période de salaire après reprise.', 1;
GO

PRINT N'Migration 0053 (historique des salaires) terminée.';
GO
