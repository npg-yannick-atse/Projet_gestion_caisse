/* ============================================================================
   Clôture de caisse : un solde PAR DEVISE
   Base : npg_gestion_caisse (SQL Server) — idempotent.

   Une caisse peut détenir plusieurs devises (constaté en base : CI01 porte
   267 180 USD et −175 000 EUR). La session de caisse n'enregistrait qu'UN seul
   `solde_cloture`, calculé toutes devises additionnées — un chiffre qui ne
   représentait rien puisqu'il mélangeait des unités différentes.

   On conserve `session_cloture.solde_cloture` (devise principale de la caisse,
   compatibilité et affichage résumé) et on ajoute le détail ligne par ligne.

   L'ouverture est traitée de la même façon : un solde d'ouverture par devise,
   pour que la comparaison ouverture/clôture reste possible devise par devise.
   ============================================================================ */
SET NOCOUNT ON;

IF OBJECT_ID('dbo.fin_session_caisse_devise', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.fin_session_caisse_devise (
        id            BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        session_id    BIGINT NOT NULL,
        devise_id     BIGINT NOT NULL,
        -- Solde constaté à l'ouverture et à la clôture, dans CETTE devise.
        solde_ouverture DECIMAL(19,4) NOT NULL CONSTRAINT DF_fscd_ouv DEFAULT 0,
        solde_cloture   DECIMAL(19,4) NULL,
        created_at    DATETIME2 NOT NULL CONSTRAINT DF_fscd_created DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_fscd_session FOREIGN KEY (session_id) REFERENCES dbo.fin_session_caisse(id),
        CONSTRAINT FK_fscd_devise  FOREIGN KEY (devise_id)  REFERENCES dbo.fin_devise(id)
    );
END
GO

/* Une seule ligne par (session, devise). */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_fscd_session_devise')
    CREATE UNIQUE INDEX UX_fscd_session_devise
        ON dbo.fin_session_caisse_devise (session_id, devise_id);
GO

PRINT N'Migration 0047 (solde de session par devise) terminée.';
GO
