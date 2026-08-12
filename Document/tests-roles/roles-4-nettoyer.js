/**
 * Nettoyage complet du test rôle par rôle. Tout en UNE transaction : si une
 * étape échoue, rien n'est supprimé — on ne laisse pas la base à moitié nettoyée.
 *
 * Suppressions DURES (pas de soft-delete) : ces lignes n'ont jamais rien
 * représenté de réel, les garder en `deleted_at` polluerait les contrôles
 * d'unicité de code.
 */
const { pool, PREFIXE, sql } = require('./roles-lib');
const M = 'ZZ-TEST-ROLE';

(async () => {
  const p = await pool();
  const tx = p.transaction();
  await tx.begin();
  const r = (q) => new (sql.Request)(tx).query(q);
  const etapes = [];

  try {
    const ids = (await r(`SELECT id FROM sec_user WHERE matricule LIKE '${PREFIXE}%'`)).recordset.map((x) => x.id);
    if (ids.length === 0) throw new Error('Aucun compte de test : rien à nettoyer.');
    const L = ids.join(',');

    const faire = async (libelle, q) => {
      const res = await r(q);
      etapes.push({ etape: libelle, lignes: res.rowsAffected[0] ?? 0 });
    };

    // 1) Grand livre : écritures AVANT opérations (l'écriture porte le uuid).
    //    La chaîne de hash est PAR TRANSACTION : retirer ces transactions
    //    entières ne touche à aucune écriture réelle.
    await faire(
      'écritures comptables',
      `DELETE FROM trx_ecriture_comptable
       WHERE transaction_uuid IN (SELECT transaction_uuid FROM trx_operation WHERE user_id IN (${L}))`,
    );
    await faire('opérations', `DELETE FROM trx_operation WHERE user_id IN (${L})`);

    // 2) Taux : supprimer les périodes créées pendant le test, puis ROUVRIR la
    //    dernière période réelle — sinon le couple USD→XOF resterait sans taux
    //    en vigueur.
    const derniereReelle = (
      await r(`SELECT TOP 1 id FROM fin_taux_echange
               WHERE created_by_id IS NULL AND devise_source_id <> devise_cible_id
                 AND motif NOT LIKE '%${M}%'
               ORDER BY date_validite_debut DESC`)
    ).recordset[0];
    await faire(
      'périodes de taux du test',
      `DELETE FROM fin_taux_echange WHERE created_by_id IN (${L}) OR motif LIKE '%${M}%'`,
    );
    if (derniereReelle) {
      await faire(
        'taux réel rouvert',
        `UPDATE fin_taux_echange SET date_validite_fin = NULL WHERE id = ${derniereReelle.id}`,
      );
    }

    // 3) Comptes financiers : portefeuilles avant caisses.
    await faire('portefeuilles', `DELETE FROM fin_portefeuille WHERE code LIKE '${M}%'`);
    await faire('caisses', `DELETE FROM fin_caisse WHERE code LIKE '${M}%'`);

    // 4) Référentiel.
    await faire('partenaires', `DELETE FROM ref_partenaire WHERE code LIKE '${M}%'`);
    await faire('centres de coût', `DELETE FROM ref_cost_center WHERE code LIKE '${M}%'`);
    await faire('directions', `DELETE FROM sec_direction WHERE code LIKE '${M}%'`);
    await faire('types de bénéfice', `DELETE FROM ref_type_benefice WHERE code LIKE '${M}%'`);

    // 5) Empreinte d'audit laissée par les appels de test.
    await faire('journal d’audit', `DELETE FROM aud_journal WHERE user_id IN (${L})`);

    // 6) Paramètre touché : la VALEUR n'a pas changé ('30'), seul l'auteur
    //    pointait sur un compte qui va disparaître.
    await faire(
      'auteur de paramètre',
      `UPDATE app_parametre SET updated_by_id = NULL WHERE updated_by_id IN (${L})`,
    );

    // 7) Les comptes eux-mêmes.
    await faire('rôles attribués', `DELETE FROM sec_user_role WHERE user_id IN (${L})`);
    await faire('comptes de test', `DELETE FROM sec_user WHERE id IN (${L})`);

    await tx.commit();
    console.log('=== Nettoyage effectué (transaction validée) ===');
    console.table(etapes);
  } catch (e) {
    await tx.rollback();
    console.error('ÉCHEC — transaction annulée, RIEN n’a été supprimé :', e.message);
    await p.close();
    process.exit(1);
  }

  // --- Contrôle : ne doit plus rien rester
  const restes = [];
  const compter = async (libelle, q) => {
    const n = (await p.request().query(q)).recordset[0].n;
    restes.push({ verification: libelle, restant: n });
  };
  await compter('comptes TEST-ROLE-*', `SELECT COUNT(*) n FROM sec_user WHERE matricule LIKE '${PREFIXE}%'`);
  await compter('opérations orphelines', `SELECT COUNT(*) n FROM trx_operation WHERE motif = '${M}'`);
  await compter('lignes ZZ-TEST-ROLE (référentiel)',
    `SELECT (SELECT COUNT(*) FROM ref_partenaire WHERE code LIKE '${M}%')
          + (SELECT COUNT(*) FROM ref_cost_center WHERE code LIKE '${M}%')
          + (SELECT COUNT(*) FROM sec_direction WHERE code LIKE '${M}%')
          + (SELECT COUNT(*) FROM ref_type_benefice WHERE code LIKE '${M}%')
          + (SELECT COUNT(*) FROM fin_caisse WHERE code LIKE '${M}%')
          + (SELECT COUNT(*) FROM fin_portefeuille WHERE code LIKE '${M}%') n`);
  await compter('périodes de taux parasites', `SELECT COUNT(*) n FROM fin_taux_echange WHERE motif LIKE '%${M}%'`);
  await compter('couples SANS taux en vigueur',
    `SELECT COUNT(*) n FROM (SELECT devise_source_id, devise_cible_id FROM fin_taux_echange
       WHERE deleted_at IS NULL GROUP BY devise_source_id, devise_cible_id
       HAVING SUM(CASE WHEN date_validite_fin IS NULL THEN 1 ELSE 0 END) <> 1) x`);
  console.log('\n=== Contrôle après nettoyage (tout doit être à 0) ===');
  console.table(restes);

  const taux = await p.request().query(
    `SELECT t.id, s.code+'->'+c.code AS couple, t.taux, t.date_validite_debut AS debut, t.date_validite_fin AS fin, t.source
     FROM fin_taux_echange t JOIN fin_devise s ON s.id=t.devise_source_id JOIN fin_devise c ON c.id=t.devise_cible_id
     WHERE t.deleted_at IS NULL ORDER BY t.id`);
  console.log('\n=== Taux restants ===');
  console.table(taux.recordset);

  await p.close();
})().catch((e) => { console.error(e); process.exit(1); });
