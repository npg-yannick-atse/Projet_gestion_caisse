/* Budget mensuel des portefeuilles (Modèle A : recharge mensuelle, sans report du reliquat).
   - budget_mensuel    : plafond budgétaire mensuel (NULL = pas de plafond mensuel).
   - budget_reset_mois : dernier mois 'YYYY-MM' où le budget a été réajusté (idempotence du job).
   Au début de chaque mois, le portefeuille est réajusté à budget_mensuel
   (recharge du manque / reprise du reliquat). Idempotent. */
IF COL_LENGTH('dbo.fin_portefeuille', 'budget_mensuel') IS NULL
    ALTER TABLE dbo.fin_portefeuille ADD budget_mensuel DECIMAL(19,4) NULL;

IF COL_LENGTH('dbo.fin_portefeuille', 'budget_reset_mois') IS NULL
    ALTER TABLE dbo.fin_portefeuille ADD budget_reset_mois NVARCHAR(7) NULL;
GO
