/**
 * Test rôle par rôle contre l'API réelle.
 *
 * ATTENDU, calculé depuis la base (jamais deviné) :
 *   - permission nulle            → tout authentifié passe
 *   - assertPermission            → bypass si le rôle est admin (SUPER_ADMIN,
 *                                   ADMINISTRATEUR, ou DAF qui se déplie en
 *                                   ADMINISTRATEUR), sinon la permission doit
 *                                   être attachée au rôle
 *   - assertPermissionStrict      → aucun bypass : la permission seule compte
 *
 * OBTENU : 401/403 = refusé. Tout le reste = la garde a laissé passer, même si
 * l'action échoue ensuite pour une raison métier (400, 404, 409) — le contrôle
 * d'accès s'exécute avant la logique métier.
 */
const fs = require('fs');
const { pool, jeton, ROLES, SANS_ROLE } = require('./roles-lib');

const BASE = 'http://localhost:8091/api/v1';
const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMINISTRATEUR'];
const EXPANSION = { DAF: ['ADMINISTRATEUR', 'CAISSIER'] };

let compteur = 0;
const ctx = { suffixe: () => `${Date.now().toString(36)}${(compteur++).toString(36)}` };

const resoudre = (v) => (typeof v === 'function' ? v() : v);

async function appeler(action, token) {
  const url = BASE + resoudre(action.url);
  const opts = { method: action.m, headers: { Authorization: `Bearer ${token}` } };
  if (action.body) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(resoudre(action.body));
  }
  try {
    const r = await fetch(url, { ...opts, signal: AbortSignal.timeout(30000) });
    let corps = '';
    try { corps = JSON.stringify(await r.json()).slice(0, 160); } catch { /* vide */ }
    return { statut: r.status, corps };
  } catch (e) {
    return { statut: 0, corps: e.message };
  }
}

(async () => {
  const p = await pool();
  const comptes = JSON.parse(fs.readFileSync(__dirname + '/comptes.json', 'utf8'));

  // --- Contexte : identifiants réels nécessaires aux appels
  const d = await p.request().query("SELECT id, code FROM fin_devise");
  ctx.deviseXofId = d.recordset.find((x) => x.code === 'XOF').id;
  ctx.deviseUsdId = d.recordset.find((x) => x.code === 'USD').id;
  const c = await p.request().query("SELECT TOP 1 id FROM fin_caisse WHERE code='CI02' AND deleted_at IS NULL");
  ctx.caisseId = c.recordset[0]?.id;
  const pf = await p.request().query(`SELECT TOP 1 id FROM fin_portefeuille WHERE caisse_source_id=${ctx.caisseId} AND deleted_at IS NULL`);
  ctx.portefeuilleId = pf.recordset[0]?.id;
  const e = await p.request().query('SELECT TOP 1 id FROM ref_employe WHERE deleted_at IS NULL');
  ctx.employeId = e.recordset[0]?.id;
  ctx.userIdAdmin = '1';

  // --- Permissions réellement attachées à chaque rôle
  const perms = await p.request().query(
    `SELECT r.code AS role, pe.code AS permission
     FROM sec_role r
     JOIN sec_role_permission rp ON rp.role_id = r.id
     JOIN sec_permission pe ON pe.id = rp.permission_id`,
  );
  const parRole = new Map();
  for (const r of [...ROLES, SANS_ROLE]) parRole.set(r, new Set());
  for (const row of perms.recordset) parRole.get(row.role)?.add(row.permission);

  const estAdmin = (role) => {
    const codes = new Set([role, ...(EXPANSION[role] ?? [])]);
    return ADMIN_ROLES.some((a) => codes.has(a));
  };
  const attendu = (role, action) => {
    if (!action.permission) return true;
    if (!action.strict && estAdmin(role)) return true;
    return parRole.get(role)?.has(action.permission) ?? false;
  };

  const ACTIONS = require('./roles-actions')(ctx);
  const lignes = [];
  const ecarts = [];

  for (const compte of comptes) {
    const token = jeton(compte);
    for (const action of ACTIONS) {
      const doitPasser = attendu(compte.role, action);

      // Une écriture n'est JOUÉE que si elle doit être refusée (un 403 n'écrit
      // rien) ou si le rôle y a droit — auquel cas on assume et on nettoie.
      const res = await appeler(action, token);
      const refuse = res.statut === 401 || res.statut === 403;
      const conforme = refuse === !doitPasser;

      const ligne = {
        role: compte.role,
        action: action.id,
        permission: action.permission ?? '(ouverte)',
        strict: action.strict ? 'STRICT' : '',
        attendu: doitPasser ? 'autorisé' : 'refusé',
        obtenu: refuse ? `refusé (${res.statut})` : `passé (${res.statut})`,
        verdict: conforme ? 'ok' : '!! ECART',
      };
      lignes.push(ligne);
      if (!conforme) ecarts.push({ ...ligne, corps: res.corps });
    }
  }

  fs.writeFileSync(__dirname + '/resultats.json', JSON.stringify(lignes, null, 2));

  console.log(`\n${lignes.length} appels (${comptes.length} rôles × ${ACTIONS.length} actions)\n`);

  // Synthèse par rôle
  const synthese = comptes.map((c) => {
    const l = lignes.filter((x) => x.role === c.role);
    return {
      role: c.role,
      autorisé: l.filter((x) => x.attendu === 'autorisé').length,
      refusé: l.filter((x) => x.attendu === 'refusé').length,
      écarts: l.filter((x) => x.verdict !== 'ok').length,
    };
  });
  console.table(synthese);

  if (ecarts.length === 0) {
    console.log('\nAUCUN ECART : le comportement observé correspond aux droits en base.');
  } else {
    console.log(`\n!! ${ecarts.length} ECART(S) :`);
    console.table(ecarts.map(({ corps, ...r }) => r));
    for (const e of ecarts.slice(0, 10)) console.log(`  ${e.role} / ${e.action} → ${e.corps}`);
  }

  await p.close();
})().catch((e) => { console.error(e); process.exit(1); });
