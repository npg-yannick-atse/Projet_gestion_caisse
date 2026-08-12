/**
 * Les actions testées, avec la permission que le CODE exige pour chacune.
 * `strict: true` = assertPermissionStrict → aucun bypass administrateur.
 * `permission: null` = ouverte à tout authentifié (règle « lectures annuaire »).
 *
 * `ecrit: true` marque celles qui modifient réellement des données : elles ne
 * sont jouées que pour les rôles censés y avoir droit, et nettoyées ensuite.
 */
const MARQUEUR = 'ZZ-TEST-ROLE';

module.exports = (ctx) => [
  /* ---------- Lectures ouvertes à tout authentifié ---------- */
  { id: 'lire-devises', m: 'GET', url: '/devises', permission: null },
  { id: 'lire-caisses', m: 'GET', url: '/caisses', permission: null },
  { id: 'lire-portefeuilles', m: 'GET', url: '/portefeuilles', permission: null },
  { id: 'lire-partenaires', m: 'GET', url: '/referentiel/partenaires', permission: null },
  { id: 'lire-cost-centers', m: 'GET', url: '/referentiel/cost-centers', permission: null },
  { id: 'lire-directions', m: 'GET', url: '/directions', permission: null },
  { id: 'lire-roles', m: 'GET', url: '/roles', permission: null },
  { id: 'lire-taux', m: 'GET', url: '/taux-change', permission: null },
  { id: 'lire-taux-reference', m: 'GET', url: '/taux-change/reference', permission: null },
  { id: 'lire-parametres', m: 'GET', url: '/parametres', permission: null },
  { id: 'lire-bons', m: 'GET', url: '/bons', permission: null },
  { id: 'lire-solde-caisse', m: 'GET', url: () => `/caisses/${ctx.caisseId}/solde`, permission: null },
  { id: 'lire-solde-consolide', m: 'GET', url: () => `/caisses/${ctx.caisseId}/solde-consolide`, permission: null },

  /* ---------- Lectures protégées ---------- */
  { id: 'lire-audit', m: 'GET', url: '/audit', permission: 'AUDIT_VOIR', strict: true },
  { id: 'lire-employes', m: 'GET', url: '/employes', permission: 'EMPLOYE_VOIR' },
  { id: 'lire-salaires-employe', m: 'GET', url: () => `/employes/${ctx.employeId}/salaires`, permission: 'EMPLOYE_VOIR_SALAIRE' },
  { id: 'lire-interims', m: 'GET', url: '/interims', permission: 'INTERIM_VOIR' },
  { id: 'sap-ping', m: 'GET', url: '/sap/ping', permission: 'SAP_CONSULTER' },
  // Ouverte DÉLIBÉRÉMENT (aucun assertPermission sur @Get('mapping')) : donnée
  // de référence qui alimente des écrans, au même titre que les devises.
  { id: 'lire-sap-mapping', m: 'GET', url: '/sap/mapping', permission: null },

  /* ---------- Écritures : référentiel ---------- */
  { id: 'creer-partenaire', m: 'POST', url: '/partenaires', permission: 'PARTENAIRE_GERER', ecrit: true,
    body: () => ({ code: `${MARQUEUR}-${ctx.suffixe()}`, raisonSociale: 'Partenaire de test', typePartenaire: 'FOURNISSEUR' }) },
  { id: 'creer-cost-center', m: 'POST', url: '/cost-centers', permission: 'COST_CENTER_GERER', ecrit: true,
    body: () => ({ code: `${MARQUEUR}-${ctx.suffixe()}`, libelle: 'CC de test' }) },
  { id: 'creer-direction', m: 'POST', url: '/directions', permission: 'DIRECTION_GERER', ecrit: true,
    body: () => ({ code: `${MARQUEUR}-${ctx.suffixe()}`, libelle: 'Direction de test' }) },
  { id: 'creer-type-benefice', m: 'POST', url: '/types-benefice', permission: 'EMPLOYE_GERER', ecrit: true,
    body: () => ({ code: `${MARQUEUR}-${ctx.suffixe()}`, libelle: 'Benefice de test', modeMontant: 'SAISI', requiertPeriode: false, recurrent: false }) },

  /* ---------- Écritures : taux de change (le chantier du jour) ---------- */
  { id: 'creer-taux', m: 'POST', url: '/taux-change', permission: 'TAUX_GERER', ecrit: true,
    body: () => ({ deviseSourceId: ctx.deviseUsdId, deviseCibleId: ctx.deviseXofId, taux: '577.77777777', motif: MARQUEUR }) },
  { id: 'importer-taux', m: 'POST', url: '/taux-change/importer', permission: 'TAUX_GERER', ecrit: true, body: () => ({}) },

  /* ---------- Écritures : financier (STRICT, aucun bypass admin) ---------- */
  { id: 'creer-caisse', m: 'POST', url: '/caisses', permission: 'CAISSE_MODIFIER', strict: true, ecrit: true,
    body: () => ({ code: `${MARQUEUR}${ctx.suffixe()}`, libelle: 'Caisse de test', deviseId: ctx.deviseXofId }) },
  { id: 'ouvrir-caisse', m: 'POST', url: () => `/caisses/${ctx.caisseId}/ouvrir`, permission: 'CAISSE_OUVRIR', strict: true, ecrit: true,
    body: () => ({}), dangereux: true },
  { id: 'creer-portefeuille', m: 'POST', url: '/portefeuilles', permission: 'PORTEFEUILLE_MODIFIER', strict: true, ecrit: true,
    body: () => ({ code: `${MARQUEUR}${ctx.suffixe()}`, libelle: 'PF de test', caisseSourceId: ctx.caisseId, deviseId: ctx.deviseXofId, proprietaireType: 'USER', proprietaireId: ctx.userIdAdmin }) },

  /* ---------- Écritures : transactionnel ---------- */
  { id: 'encaisser', m: 'POST', url: '/encaissements', permission: 'ENCAISSEMENT_CREER', ecrit: true, dangereux: true,
    body: () => ({ caisseId: ctx.caisseId, montant: '1000', deviseId: ctx.deviseXofId, motif: MARQUEUR }) },
  { id: 'recharger', m: 'POST', url: '/recharges', permission: 'RECHARGE_EXECUTER', ecrit: true, dangereux: true,
    body: () => ({ caisseId: ctx.caisseId, portefeuilleId: ctx.portefeuilleId, montant: '100' }) },

  /* ---------- Écritures : sécurité ---------- */
  // `code` est validé contre une liste FERMÉE par le DTO, et la validation
  // s'exécute avant le contrôleur : un code libre donnait 400 sans jamais
  // atteindre la garde. On envoie donc un code existant — la garde franchie,
  // le service refusera le doublon, ce qui suffit à prouver qu'elle a laissé passer.
  { id: 'creer-role', m: 'POST', url: '/roles', permission: 'ADMIN_ROLE', ecrit: true,
    body: () => ({ code: 'VALIDATEUR', libelle: 'Role de test (doublon attendu)' }) },
  { id: 'modifier-parametre', m: 'PATCH', url: '/parametres/TAUX_ALERTE_JOURS', permission: 'PARAMETRE_MODIFIER', ecrit: true,
    body: () => ({ valeur: '30' }) },
];

module.exports.MARQUEUR = MARQUEUR;
