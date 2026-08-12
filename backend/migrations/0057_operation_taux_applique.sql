/* ============================================================================
   Le taux devient une donnée de l'OPÉRATION, plus seulement du jour
   Base : npg_gestion_caisse (SQL Server) — idempotent.

   DEMANDE MÉTIER (12/08/2026)
   ---------------------------
   `fin_taux_echange` (migration 0055) ne connaît qu'UN taux par couple à un
   instant donné. Or le taux réellement obtenu appartient à l'opération, pas à
   la journée :

       lundi  9 h   1 000 USD reçus au taux 590   →   590 000 XOF
       lundi 15 h   1 000 USD reçus au taux 585   →   585 000 XOF

   Deux encaissements le même jour, deux taux. Jusqu'ici `trx_operation` portait
   le montant et la devise mais AUCUN taux : « 1 000 USD » était enregistré sans
   qu'on sache jamais ce que ça avait valu.

   LES DEUX TAUX COEXISTENT, ils ne se remplacent pas :
     - `fin_taux_echange`      = le cours du jour. Une ESTIMATION. Sert à
                                 pré-remplir la saisie et à convertir le passé
                                 quand on n'a rien de mieux.
     - `trx_operation.taux_applique` = ce qui s'est réellement passé. Un FAIT.
                                 Dès qu'il existe, il l'emporte.

   DÉCISION DU USER (12/08) : l'écart entre les deux est ENREGISTRÉ, pas
   comptabilisé. Aucune écriture de gain / perte de change n'est produite — cela
   supposerait la convention de partie double, ouverte depuis le 28/05
   (Document/Points_en_attente.md §3).

   POURQUOI STOCKER LA CONTRE-VALEUR plutôt que la recalculer :
   l'arrondi effectué ce jour-là est lui aussi un fait. Recalculé six mois plus
   tard, il donnerait un franc d'écart et plus personne ne saurait lequel fait
   foi. On fige donc le résultat, comme `fin_paiement_salaire.montant` fige le
   salaire au moment du versement.

   POURQUOI STOCKER AUSSI LA DEVISE de la contre-valeur : `DEVISE_REFERENCE` est
   un paramètre modifiable. Sans cette colonne, changer la devise de référence
   ferait relire tout l'historique dans la mauvaise unité, en silence.

   NULL = « on ne sait pas ». C'est le cas de tout l'historique antérieur et des
   opérations en devise de référence, qui n'ont pas de conversion à décrire. La
   consolidation retombe alors sur le cours du jour, ce qu'elle sait déjà faire.
   ============================================================================ */
SET NOCOUNT ON;

IF COL_LENGTH('dbo.trx_operation', 'taux_applique') IS NULL
    ALTER TABLE dbo.trx_operation ADD taux_applique DECIMAL(19,8) NULL;
GO
IF COL_LENGTH('dbo.trx_operation', 'contre_valeur') IS NULL
    ALTER TABLE dbo.trx_operation ADD contre_valeur DECIMAL(19,4) NULL;
GO
IF COL_LENGTH('dbo.trx_operation', 'devise_contre_valeur_id') IS NULL
    ALTER TABLE dbo.trx_operation ADD devise_contre_valeur_id BIGINT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_trx_op_devise_cv')
    ALTER TABLE dbo.trx_operation
        ADD CONSTRAINT FK_trx_op_devise_cv
        FOREIGN KEY (devise_contre_valeur_id) REFERENCES dbo.fin_devise(id);
GO

/* Un taux nul ou négatif ne convertit rien : il inverserait le sens ou
   annulerait le montant. Même garde que CK_fin_te_taux. */
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_trx_op_taux_positif')
    ALTER TABLE dbo.trx_operation
        ADD CONSTRAINT CK_trx_op_taux_positif
        CHECK (taux_applique IS NULL OR taux_applique > 0);
GO

/* Les trois colonnes vont ensemble : un taux sans contre-valeur laisserait le
   lecteur la recalculer lui-même (donc retomber sur l'arrondi qu'on voulait
   justement figer), et une contre-valeur sans devise ne veut rien dire. */
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_trx_op_conversion_complete')
    ALTER TABLE dbo.trx_operation
        ADD CONSTRAINT CK_trx_op_conversion_complete
        CHECK (
            (taux_applique IS NULL AND contre_valeur IS NULL AND devise_contre_valeur_id IS NULL)
         OR (taux_applique IS NOT NULL AND contre_valeur IS NOT NULL AND devise_contre_valeur_id IS NOT NULL)
        );
GO

/* Les états et exports filtrent les opérations converties. */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_trx_op_taux_applique')
    CREATE INDEX IX_trx_op_taux_applique
        ON dbo.trx_operation(devise_id, date_operation)
        WHERE taux_applique IS NOT NULL;
GO

PRINT N'Migration 0057 (taux appliqué par opération) terminée.';
GO
