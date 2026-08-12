/** Inventaire de TOUT ce que le test a pu créer ou modifier. Lecture seule. */
const { pool, PREFIXE } = require('./roles-lib');
const M = 'ZZ-TEST-ROLE';

(async () => {
  const p = await pool();
  const ids = (await p.request().input('pfx', PREFIXE + '%')
    .query('SELECT id FROM sec_user WHERE matricule LIKE @pfx')).recordset.map((r) => r.id);
  const liste = ids.join(',') || '0';

  const requetes = [
    ['comptes de test', `SELECT id, matricule FROM sec_user WHERE id IN (${liste})`],
    ['partenaires', `SELECT id, code, raison_sociale FROM ref_partenaire WHERE code LIKE '${M}%'`],
    ['cost centers', `SELECT id, code FROM ref_cost_center WHERE code LIKE '${M}%'`],
    // sec_direction, pas ref_direction : les directions vivent dans le module sécurité.
    ['directions', `SELECT id, code FROM sec_direction WHERE code LIKE '${M}%'`],
    ['types benefice', `SELECT id, code FROM ref_type_benefice WHERE code LIKE '${M}%'`],
    ['caisses', `SELECT id, code, statut FROM fin_caisse WHERE code LIKE '${M}%'`],
    ['portefeuilles', `SELECT id, code FROM fin_portefeuille WHERE code LIKE '${M}%'`],
    ['taux (motif test)', `SELECT id, taux, date_validite_debut, date_validite_fin, source FROM fin_taux_echange WHERE motif LIKE '%${M}%'`],
    ['TOUS les taux', `SELECT id, taux, date_validite_debut, date_validite_fin, source, motif FROM fin_taux_echange WHERE deleted_at IS NULL ORDER BY id`],
    ['operations des comptes test', `SELECT id, transaction_uuid, type_operation, montant, caisse_id, user_id, motif FROM trx_operation WHERE user_id IN (${liste})`],
    ['ecritures liees', `SELECT COUNT(*) AS n FROM trx_ecriture_comptable WHERE transaction_uuid IN (SELECT transaction_uuid FROM trx_operation WHERE user_id IN (${liste}))`],
    ['sessions caisse ouvertes par test', `SELECT id, caisse_id, statut, created_by_id FROM fin_session_caisse WHERE created_by_id IN (${liste})`],
    ['etat caisses CI01/CI02', `SELECT id, code, statut FROM fin_caisse WHERE code IN ('CI01','CI02')`],
    ['roles (doublon ?)', `SELECT id, code FROM sec_role WHERE code='VALIDATEUR'`],
    ['parametre TAUX_ALERTE_JOURS', `SELECT cle, valeur, updated_at, updated_by_id FROM app_parametre WHERE cle='TAUX_ALERTE_JOURS'`],
  ];

  for (const [titre, q] of requetes) {
    try {
      const r = await p.request().query(q);
      console.log(`\n=== ${titre} (${r.recordset.length}) ===`);
      if (r.recordset.length) console.table(r.recordset);
    } catch (e) {
      console.log(`\n=== ${titre} === ERREUR : ${e.message}`);
    }
  }
  await p.close();
})().catch((e) => { console.error(e); process.exit(1); });
