/* ============================================================================
   Référentiel divisions : alignement sur les sites SAP (T001W)
   Base : npg_gestion_caisse (SQL Server) — idempotent.

   CONSTAT (relevé dans SAP le 05/08/2026, mandant 100)
   ----------------------------------------------------
   Les « divisions » de l'application correspondent aux SITES SAP (`T001W`,
   champ WERKS sur 4 caractères) — et non au secteur d'activité `SPART`, codé
   sur 2 caractères, ni aux bureaux de vente `TVBUR`, qui ne contiennent aucun
   code SS*. Le lien vers le client se fait par `KNVV.VWERK`.

   `ref_division` ne contenait qu'UNE ligne, erronée sur les deux plans :
   code SS11, libellé « SS11 », rattachée au **Ghana** — alors que SS11 est
   « NPG - Vente Local » en **Côte d'Ivoire**.

   RATTACHEMENT AU PAYS
   --------------------
   Les 10 sites portent tous `LAND1 = CI` dans T001W, y compris ceux nommés
   « Togo » (SS20-SS24). Choix validé par le user le 05/08/2026 : rester
   **fidèle à SAP**, donc tout rattacher à la Côte d'Ivoire, quitte à voir des
   divisions « Togo » sous CI. Ne pas « corriger » sans arbitrage métier.

   SS10 et SS20 sont les sites industriels : aucun client rattaché (ce sont des
   usines, pas des entités de vente). Ils sont créés malgré tout, pour que le
   référentiel reflète T001W.

   PRÉREQUIS : migration 0049 (sans elle, le pays CI est en soft-delete).
   ============================================================================ */
SET NOCOUNT ON;

DECLARE @paysCI BIGINT = (
    SELECT TOP 1 id FROM dbo.ref_pays WHERE code = N'CI' AND deleted_at IS NULL
);

IF @paysCI IS NULL
    THROW 50050, N'0050 : pays CI introuvable ou inactif — appliquer d''abord la migration 0049.', 1;

DECLARE @divisions TABLE (code NVARCHAR(20) PRIMARY KEY, libelle NVARCHAR(150));
INSERT INTO @divisions (code, libelle) VALUES
    (N'SS10', N'NPG - Industrie'),
    (N'SS11', N'NPG - Vente Local'),
    (N'SS12', N'NPG - Vente Export'),
    (N'SS13', N'NPG - Vente Export 2'),
    (N'SS14', N'NPG - Vente Regional 1'),
    (N'SS20', N'NPG - Industrie Togo'),
    (N'SS21', N'NPG - Vente Local Togo'),
    (N'SS22', N'NPG - Vente Export Togo'),
    (N'SS23', N'NPG - Vente Export 2 Togo'),
    (N'SS24', N'NPG - Vente Regional 1 Togo');

/* --- Remise en état des lignes déjà présentes (cas de SS11/Ghana) --------- */
UPDATE d
SET d.pays_id       = @paysCI,
    d.libelle       = v.libelle,
    d.est_actif     = 1,
    d.deleted_at    = NULL,
    d.deleted_by_id = NULL,
    d.updated_at    = SYSUTCDATETIME(),
    d.version       = d.version + 1
FROM dbo.ref_division d
JOIN @divisions v ON v.code = d.code
WHERE d.pays_id <> @paysCI
   OR d.libelle <> v.libelle
   OR d.est_actif = 0
   OR d.deleted_at IS NOT NULL;

/* --- Création des divisions absentes -------------------------------------- */
INSERT INTO dbo.ref_division (code, libelle, pays_id, est_actif)
SELECT v.code, v.libelle, @paysCI, 1
FROM @divisions v
WHERE NOT EXISTS (SELECT 1 FROM dbo.ref_division d WHERE d.code = v.code);

/* --- Contrôle : les 10 divisions doivent être actives sur CI -------------- */
IF (
    SELECT COUNT(*) FROM dbo.ref_division d
    JOIN @divisions v ON v.code = d.code
    WHERE d.pays_id = @paysCI AND d.est_actif = 1 AND d.deleted_at IS NULL
) <> 10
    THROW 50050, N'0050 : les 10 divisions ne sont pas toutes actives sur la Côte d''Ivoire.', 1;
GO

PRINT N'Migration 0050 (import des divisions SAP T001W) terminée.';
GO
