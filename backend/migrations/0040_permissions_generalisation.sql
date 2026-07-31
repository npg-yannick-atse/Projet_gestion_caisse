/* ============================================================================
   Généralisation du modèle « une permission par action » (option 2)
   Base : npg_gestion_caisse (SQL Server) — idempotent.

   Jusqu'ici la plupart des modules étaient gardés par RÔLE (@Roles('ADMINISTRATEUR'))
   ou pas gardés du tout. Cette migration crée le catalogue de permissions manquant
   pour SÉCURITÉ, RÉFÉRENTIEL, TRANSACTIONNEL, FINANCIER, AUDIT et SAP, puis
   l'attribue AUX RÔLES QUI DISPOSENT DÉJÀ DE CES DROITS AUJOURD'HUI.

   → Le comportement observable reste donc identique après application ; ce qui
     change, c'est qu'un droit peut désormais être délégué finement (profil,
     permission extra, intérim) sans donner le rôle entier.

   Permissions déjà existantes et RÉUTILISÉES telles quelles (non recréées ici) :
     ADMIN_USER (gestion des utilisateurs et de leurs droits),
     ADMIN_ROLE (gestion des rôles / permissions / profils),
     INTERIM_DECLARER, TRANSFERT_INITIER.

   Note TRANSFERT_INITIER : la permission existait mais n'était attribuée qu'à
   CAISSIER, alors que le service autorise aussi GESTIONNAIRE_PORTEFEUILLE.
   L'attribution est complétée ci-dessous pour rester iso-comportement.
   ============================================================================ */
SET NOCOUNT ON;

/* ---------------------------------------------------------------------------
   1) Catalogue des permissions
   --------------------------------------------------------------------------- */
DECLARE @perms TABLE (code NVARCHAR(100), libelle NVARCHAR(255), module NVARCHAR(100));

INSERT INTO @perms(code, libelle, module) VALUES
    -- SÉCURITÉ
    (N'UTILISATEUR_VOIR',       N'Consulter la liste des utilisateurs et leurs droits', N'SECURITE'),
    (N'PROFIL_GERER',           N'Créer / modifier / supprimer des profils',            N'SECURITE'),
    (N'DIRECTION_GERER',        N'Créer / modifier / supprimer des directions',         N'SECURITE'),
    (N'INTERIM_VOIR',           N'Consulter les intérims de tous les utilisateurs',     N'SECURITE'),
    (N'INTERIM_REVOQUER',       N'Révoquer / supprimer un intérim',                     N'SECURITE'),
    -- AUDIT
    (N'AUDIT_VOIR',             N'Consulter le journal d''audit',                       N'AUDIT'),
    -- RÉFÉRENTIEL
    (N'PARAMETRE_MODIFIER',     N'Modifier les paramètres de l''application',           N'REFERENTIEL'),
    (N'PARTENAIRE_GERER',       N'Créer / modifier / supprimer des partenaires',        N'REFERENTIEL'),
    (N'COST_CENTER_GERER',      N'Créer / modifier / supprimer des centres de coût',    N'REFERENTIEL'),
    (N'NATURE_OPERATION_GERER', N'Créer / modifier / supprimer des natures d''opération', N'REFERENTIEL'),
    (N'PLAN_COMPTABLE_GERER',   N'Gérer le plan comptable et les natures comptables',   N'REFERENTIEL'),
    (N'PAYS_GERER',             N'Créer / supprimer des pays et divisions',             N'REFERENTIEL'),
    -- TRANSACTIONNEL
    (N'CARNET_GERER',           N'Créer et clôturer des carnets de bons manuels',       N'TRANSACTIONNEL'),
    (N'BON_MANUEL_CREER',       N'Créer un bon manuel (décaissement direct)',           N'TRANSACTIONNEL'),
    (N'OPERATION_CREER',        N'Créer une opération de caisse / portefeuille',        N'TRANSACTIONNEL'),
    (N'ECRITURE_CREER',         N'Créer des écritures comptables',                      N'TRANSACTIONNEL'),
    (N'LEDGER_INTEGRITE',       N'Vérifier la chaîne d''intégrité des écritures',       N'TRANSACTIONNEL'),
    -- FINANCIER
    (N'ENCAISSEMENT_CREER',     N'Encaisser de l''argent dans une caisse',              N'FINANCIER'),
    (N'RECHARGE_DEMANDER',      N'Demander la recharge d''un portefeuille',             N'FINANCIER'),
    (N'RECHARGE_EXECUTER',      N'Recharger un portefeuille depuis une caisse',         N'FINANCIER'),
    (N'RECHARGE_TRAITER',       N'Traiter / rejeter une demande de recharge',           N'FINANCIER'),
    (N'TRANSFERT_VALIDER',      N'Approuver ou rejeter une demande de transfert',       N'FINANCIER'),
    (N'TRANSFERT_EXECUTER',     N'Exécuter un transfert approuvé',                      N'FINANCIER'),
    -- SAP
    (N'SAP_CONSULTER',          N'Consulter SAP (ping, clients, commandes, comptes)',   N'SAP'),
    (N'SAP_SYNCHRONISER',       N'Synchroniser les référentiels depuis SAP',            N'SAP'),
    (N'SAP_ECRITURE_ENVOYER',   N'Envoyer / contrepasser une écriture dans SAP',        N'SAP'),
    (N'SAP_MAPPING_GERER',      N'Modifier le mapping comptable SAP',                   N'SAP');

INSERT INTO dbo.sec_permission(code, libelle, module)
SELECT v.code, v.libelle, v.module
FROM @perms v
WHERE NOT EXISTS (SELECT 1 FROM dbo.sec_permission p WHERE p.code = v.code);

/* ---------------------------------------------------------------------------
   2) Attribution aux rôles (miroir des droits actuels)
   --------------------------------------------------------------------------- */
DECLARE @grants TABLE (role_code NVARCHAR(100), perm_code NVARCHAR(100));

INSERT INTO @grants(role_code, perm_code) VALUES
    -- SÉCURITÉ : réservé à l'administration (équivalent @Roles('ADMINISTRATEUR'))
    (N'ADMINISTRATEUR', N'UTILISATEUR_VOIR'),      (N'SUPER_ADMIN', N'UTILISATEUR_VOIR'),
    (N'ADMINISTRATEUR', N'PROFIL_GERER'),          (N'SUPER_ADMIN', N'PROFIL_GERER'),
    (N'ADMINISTRATEUR', N'DIRECTION_GERER'),       (N'SUPER_ADMIN', N'DIRECTION_GERER'),
    (N'ADMINISTRATEUR', N'INTERIM_VOIR'),          (N'SUPER_ADMIN', N'INTERIM_VOIR'),
    (N'ADMINISTRATEUR', N'INTERIM_REVOQUER'),      (N'SUPER_ADMIN', N'INTERIM_REVOQUER'),

    -- AUDIT : Super Admin uniquement (le contrôleur l'exigeait déjà explicitement)
    (N'SUPER_ADMIN',    N'AUDIT_VOIR'),

    -- RÉFÉRENTIEL : équivalent @Roles('ADMINISTRATEUR')
    (N'ADMINISTRATEUR', N'PARAMETRE_MODIFIER'),    (N'SUPER_ADMIN', N'PARAMETRE_MODIFIER'),
    (N'ADMINISTRATEUR', N'PARTENAIRE_GERER'),      (N'SUPER_ADMIN', N'PARTENAIRE_GERER'),
    (N'ADMINISTRATEUR', N'COST_CENTER_GERER'),     (N'SUPER_ADMIN', N'COST_CENTER_GERER'),
    (N'ADMINISTRATEUR', N'NATURE_OPERATION_GERER'),(N'SUPER_ADMIN', N'NATURE_OPERATION_GERER'),
    (N'ADMINISTRATEUR', N'PLAN_COMPTABLE_GERER'),  (N'SUPER_ADMIN', N'PLAN_COMPTABLE_GERER'),
    (N'DAF',            N'PLAN_COMPTABLE_GERER'),
    (N'ADMINISTRATEUR', N'PAYS_GERER'),            (N'SUPER_ADMIN', N'PAYS_GERER'),

    -- TRANSACTIONNEL
    -- CARNET_GERER volontairement PAS donné au caissier : aujourd'hui seul un
    -- administrateur crée ou clôture un carnet (le caissier ne fait qu'y puiser
    -- des bons manuels). L'attribuer à CAISSIER élargirait le droit existant.
    (N'ADMINISTRATEUR', N'CARNET_GERER'),          (N'SUPER_ADMIN', N'CARNET_GERER'),
    (N'CAISSIER',       N'BON_MANUEL_CREER'),
    (N'ADMINISTRATEUR', N'BON_MANUEL_CREER'),      (N'SUPER_ADMIN', N'BON_MANUEL_CREER'),
    (N'ADMINISTRATEUR', N'OPERATION_CREER'),       (N'SUPER_ADMIN', N'OPERATION_CREER'),
    (N'ADMINISTRATEUR', N'ECRITURE_CREER'),        (N'SUPER_ADMIN', N'ECRITURE_CREER'),
    (N'SUPER_ADMIN',    N'LEDGER_INTEGRITE'),

    -- FINANCIER : le caissier manipule l'argent (équivalent assertAnyRole(['CAISSIER']))
    (N'CAISSIER',       N'ENCAISSEMENT_CREER'),
    (N'ADMINISTRATEUR', N'ENCAISSEMENT_CREER'),    (N'SUPER_ADMIN', N'ENCAISSEMENT_CREER'),
    -- Demander une recharge = responsable du portefeuille (pas le demandeur de bons)
    (N'VALIDATEUR',                N'RECHARGE_DEMANDER'),
    (N'GESTIONNAIRE_PORTEFEUILLE', N'RECHARGE_DEMANDER'),
    (N'ADMINISTRATEUR', N'RECHARGE_DEMANDER'),     (N'SUPER_ADMIN', N'RECHARGE_DEMANDER'),
    (N'CAISSIER',       N'RECHARGE_EXECUTER'),
    (N'ADMINISTRATEUR', N'RECHARGE_EXECUTER'),     (N'SUPER_ADMIN', N'RECHARGE_EXECUTER'),
    (N'CAISSIER',       N'RECHARGE_TRAITER'),
    (N'ADMINISTRATEUR', N'RECHARGE_TRAITER'),      (N'SUPER_ADMIN', N'RECHARGE_TRAITER'),
    -- Transferts : initier = caissier + gestionnaire ; approuver = gestionnaire
    (N'GESTIONNAIRE_PORTEFEUILLE', N'TRANSFERT_INITIER'),
    (N'GESTIONNAIRE_PORTEFEUILLE', N'TRANSFERT_VALIDER'),
    (N'ADMINISTRATEUR', N'TRANSFERT_VALIDER'),     (N'SUPER_ADMIN', N'TRANSFERT_VALIDER'),
    (N'CAISSIER',       N'TRANSFERT_EXECUTER'),
    (N'GESTIONNAIRE_PORTEFEUILLE', N'TRANSFERT_EXECUTER'),
    (N'ADMINISTRATEUR', N'TRANSFERT_EXECUTER'),    (N'SUPER_ADMIN', N'TRANSFERT_EXECUTER'),

    -- SAP : équivalent @Roles('DAF') + administration
    (N'DAF',            N'SAP_CONSULTER'),
    (N'ADMINISTRATEUR', N'SAP_CONSULTER'),         (N'SUPER_ADMIN', N'SAP_CONSULTER'),
    (N'DAF',            N'SAP_SYNCHRONISER'),
    (N'ADMINISTRATEUR', N'SAP_SYNCHRONISER'),      (N'SUPER_ADMIN', N'SAP_SYNCHRONISER'),
    (N'DAF',            N'SAP_ECRITURE_ENVOYER'),
    (N'ADMINISTRATEUR', N'SAP_ECRITURE_ENVOYER'),  (N'SUPER_ADMIN', N'SAP_ECRITURE_ENVOYER'),
    (N'DAF',            N'SAP_MAPPING_GERER'),
    (N'ADMINISTRATEUR', N'SAP_MAPPING_GERER'),     (N'SUPER_ADMIN', N'SAP_MAPPING_GERER');

INSERT INTO dbo.sec_role_permission(role_id, permission_id)
SELECT r.id, p.id
FROM @grants g
JOIN dbo.sec_role r       ON r.code = g.role_code
JOIN dbo.sec_permission p ON p.code = g.perm_code
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.sec_role_permission rp
    WHERE rp.role_id = r.id AND rp.permission_id = p.id
);

PRINT N'Migration 0040 (généralisation des permissions) terminée.';
GO
