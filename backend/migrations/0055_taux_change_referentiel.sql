/* ============================================================================
   Taux de change : le référentiel devient exploitable
   Base : npg_gestion_caisse (SQL Server) — idempotent.

   POINT DE DÉPART (constaté le 11/08/2026)
   ----------------------------------------
   `fin_taux_echange` existe depuis la création de la base, l'entité TypeORM est
   déclarée dans le module financier… et la table est VIDE, sans service, sans
   contrôleur, sans écran. Aucun taux de change n'existe donc nulle part, alors
   que l'application manipule réellement trois devises (XOF, EUR, USD) sur 137
   écritures comptables. Le multi-devises fonctionne aujourd'hui par
   CLOISONNEMENT : chaque devise dans son couloir, aucune conversion.

   Cette migration donne à la table la forme qu'exige un vrai référentiel.

   1) HISTORIQUE DE PÉRIODES, comme le salaire (migration 0053) et les bénéfices.
      Un taux n'est jamais réécrit : le corriger CLÔT la période en cours et en
      ouvre une nouvelle. Le passé reste vrai — indispensable pour reconvertir
      une opération de juin au taux de juin.

      Taux applicable à une date D = la ligne telle que
          date_validite_debut <= D  ET  (date_validite_fin IS NULL OU > D)

   2) COLONNES D'AUDIT. La table ne portait que created_at / created_by_id.
      L'entité passe sous AuditableEntity, qui exige aussi updated_at,
      updated_by_id, deleted_at, deleted_by_id et version — en omettre une donne
      « Invalid column name » à la première lecture.

   3) SOURCE renommée. Les valeurs autorisées étaient ('FIXE_DB', 'API') ; elles
      deviennent ('MANUEL', 'SAP', 'API') — SAP étant la source visée, via
      BAPI_EXCHANGERATE_GETDETAIL. Sans risque : la table est vide.

   4) CK_fin_te_dates ASSOUPLIE de « > » à « >= ». Corriger deux fois un taux le
      MÊME JOUR clôturait une période avec date_fin = date_debut, ce que
      l'ancien CHECK refusait. Une période de longueur nulle est le sens exact
      d'une saisie erronée rectifiée aussitôt : elle n'a jamais été en vigueur,
      et la règle de lecture ci-dessus ne la sélectionne jamais.

   CE QUE CETTE MIGRATION NE FAIT PAS
   ----------------------------------
   Aucune écriture comptable, aucun gain/perte de change : la conversion reste
   de l'AFFICHAGE. Le change réel attend la convention de partie double, ouverte
   depuis le 28/05/2026 (cf. Document/Points_en_attente.md §3).
   ============================================================================ */
SET NOCOUNT ON;

/* ---------------------------------------------------------------------------
   1) Colonnes d'audit manquantes
   --------------------------------------------------------------------------- */
IF COL_LENGTH('dbo.fin_taux_echange', 'updated_at') IS NULL
    ALTER TABLE dbo.fin_taux_echange ADD updated_at DATETIME2(3) NULL;
GO
IF COL_LENGTH('dbo.fin_taux_echange', 'updated_by_id') IS NULL
    ALTER TABLE dbo.fin_taux_echange ADD updated_by_id BIGINT NULL;
GO
IF COL_LENGTH('dbo.fin_taux_echange', 'deleted_at') IS NULL
    ALTER TABLE dbo.fin_taux_echange ADD deleted_at DATETIME2(3) NULL;
GO
IF COL_LENGTH('dbo.fin_taux_echange', 'deleted_by_id') IS NULL
    ALTER TABLE dbo.fin_taux_echange ADD deleted_by_id BIGINT NULL;
GO
IF COL_LENGTH('dbo.fin_taux_echange', 'version') IS NULL
    ALTER TABLE dbo.fin_taux_echange
        ADD version INT NOT NULL CONSTRAINT DF_fin_te_version DEFAULT 1;
GO

/* Pourquoi ce taux a été saisi ou modifié. Repris de ref_employe_salaire.motif :
   sur un historique, « qui » et « quand » ne suffisent pas, il faut « pourquoi ». */
IF COL_LENGTH('dbo.fin_taux_echange', 'motif') IS NULL
    ALTER TABLE dbo.fin_taux_echange ADD motif NVARCHAR(200) NULL;
GO

/* ---------------------------------------------------------------------------
   2) source : ('FIXE_DB','API') -> ('MANUEL','SAP','API')

   Les données existantes sont converties AVANT le changement de contrainte, pour
   que la migration reste jouable sur une base qui, elle, ne serait pas vide.
   --------------------------------------------------------------------------- */
IF EXISTS (SELECT 1 FROM dbo.fin_taux_echange WHERE source = N'FIXE_DB')
    UPDATE dbo.fin_taux_echange SET source = N'MANUEL' WHERE source = N'FIXE_DB';
GO

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_fin_te_source')
    ALTER TABLE dbo.fin_taux_echange DROP CONSTRAINT CK_fin_te_source;
GO
ALTER TABLE dbo.fin_taux_echange
    ADD CONSTRAINT CK_fin_te_source CHECK (source IN (N'MANUEL', N'SAP', N'API'));
GO

/* ---------------------------------------------------------------------------
   3) Dates : autoriser la période de longueur nulle (correction le même jour)
   --------------------------------------------------------------------------- */
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_fin_te_dates')
    ALTER TABLE dbo.fin_taux_echange DROP CONSTRAINT CK_fin_te_dates;
GO
ALTER TABLE dbo.fin_taux_echange
    ADD CONSTRAINT CK_fin_te_dates
        CHECK (date_validite_fin IS NULL OR date_validite_fin >= date_validite_debut);
GO

/* ---------------------------------------------------------------------------
   4) Index

   a) UN SEUL taux ouvert par couple de devises. C'est la garantie qui rend la
      lecture non ambiguë : sans elle, deux lignes sans date de fin sur EUR->XOF
      donneraient deux réponses à « quel est le taux aujourd'hui ».

      Index unique FILTRÉ sur deleted_at IS NULL — c'est-à-dire ce que le §0 de
      Points_en_attente.md réclame pour les autres tables : une ligne supprimée
      ne doit pas continuer d'occuper la place.

   b) Lecture par couple et par date : l'accès de toute conversion.
   --------------------------------------------------------------------------- */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_fin_te_couple_ouvert')
    CREATE UNIQUE INDEX UQ_fin_te_couple_ouvert
        ON dbo.fin_taux_echange(devise_source_id, devise_cible_id)
        WHERE date_validite_fin IS NULL AND deleted_at IS NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_fin_te_couple_debut')
    CREATE INDEX IX_fin_te_couple_debut
        ON dbo.fin_taux_echange(devise_source_id, devise_cible_id, date_validite_debut)
        WHERE deleted_at IS NULL;
GO

/* ---------------------------------------------------------------------------
   5) Permission

   Une seule : gérer les taux. LIRE reste ouvert à tout utilisateur authentifié,
   conformément à la règle retenue le 31/07 — les taux sont de la donnée de
   référence qui alimente des affichages partout, web comme mobile ; les
   verrouiller aveuglerait les écrans sans rien protéger.

   Mode NORMAL (pas assertPermissionStrict) : le réglage des taux relève de
   l'administration, il est légitime que le bypass administrateur s'applique.

   DAF listé explicitement : le dépliage DAF -> ADMINISTRATEUR joue sur les
   RÔLES, pas sur les permissions (cf. migration 0043).
   --------------------------------------------------------------------------- */
INSERT INTO dbo.sec_permission(code, libelle, module)
SELECT N'TAUX_GERER', N'Saisir et corriger les taux de change', N'FINANCIER'
WHERE NOT EXISTS (SELECT 1 FROM dbo.sec_permission p WHERE p.code = N'TAUX_GERER');
GO

INSERT INTO dbo.sec_role_permission(role_id, permission_id)
SELECT r.id, p.id
FROM dbo.sec_role r
JOIN dbo.sec_permission p ON p.code = N'TAUX_GERER'
WHERE r.code IN (N'SUPER_ADMIN', N'ADMINISTRATEUR', N'DAF')
  AND NOT EXISTS (
      SELECT 1 FROM dbo.sec_role_permission rp
      WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );
GO

/* ---------------------------------------------------------------------------
   6) Devise de référence

   Devise dans laquelle les écrans proposent un total consolidé. XOF : NPG
   Gandour tient ses comptes en francs CFA.

   Stockée en paramètre plutôt qu'en dur : une filiale d'un autre pays de la
   zone n'aurait pas la même.
   --------------------------------------------------------------------------- */
INSERT INTO dbo.app_parametre(cle, valeur, libelle)
SELECT v.cle, v.valeur, v.libelle
FROM (VALUES
    (N'DEVISE_REFERENCE', N'XOF',
     N'Devise de consolidation : code ISO de la devise des totaux convertis'),
    (N'TAUX_ALERTE_JOURS', N'30',
     N'Taux de change : au-delà de ce nombre de jours, un taux est signalé comme périmé')
) AS v(cle, valeur, libelle)
WHERE NOT EXISTS (SELECT 1 FROM dbo.app_parametre p WHERE p.cle = v.cle);
GO

/* ---------------------------------------------------------------------------
   7) Amorce : EUR -> XOF

   Le seul taux qu'on puisse poser sans rien supposer : la parité EUR/franc CFA
   est FIXE par accord monétaire (1 EUR = 655,957 XOF). SAP porte exactement
   cette valeur, inchangée depuis 2018.

   Les autres couples ne sont PAS amorcés délibérément. Le USD->FCFA de SAP vaut
   600,00 mais date du 15/12/2025 : le poser ici reviendrait à présenter un cours
   vieux de huit mois comme s'il était courant. Il sera importé ou saisi, avec sa
   vraie date de validité.

   date_validite_debut au 01/01/2013 : antérieure à toute écriture de la base
   (la plus ancienne est de juin 2026), donc toute opération est convertible.
   --------------------------------------------------------------------------- */
INSERT INTO dbo.fin_taux_echange
    (devise_source_id, devise_cible_id, taux, date_validite_debut, date_validite_fin, source, motif)
SELECT
    src.id, cib.id, 655.95700000, '2013-01-01T00:00:00.000', NULL, N'MANUEL',
    N'Parité fixe EUR / franc CFA (accord monétaire)'
FROM dbo.fin_devise src
CROSS JOIN dbo.fin_devise cib
WHERE src.code = N'EUR' AND cib.code = N'XOF'
  AND NOT EXISTS (
      SELECT 1 FROM dbo.fin_taux_echange t
      WHERE t.devise_source_id = src.id AND t.devise_cible_id = cib.id
        AND t.deleted_at IS NULL
  );
GO

/* --- Contrôle : la parité de référence doit exister et être exploitable ----- */
IF NOT EXISTS (
    SELECT 1
    FROM dbo.fin_taux_echange t
    JOIN dbo.fin_devise s ON s.id = t.devise_source_id AND s.code = N'EUR'
    JOIN dbo.fin_devise c ON c.id = t.devise_cible_id  AND c.code = N'XOF'
    WHERE t.date_validite_fin IS NULL AND t.deleted_at IS NULL AND t.taux > 0
)
    THROW 50055, N'0055 : le taux EUR->XOF est absent ou non exploitable après amorce.', 1;
GO

PRINT N'Migration 0055 (référentiel des taux de change) terminée.';
GO
