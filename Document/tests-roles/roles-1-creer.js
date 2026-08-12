/** Crée un compte par rôle + un compte témoin sans rôle. Idempotent. */
const { PREFIXE, ROLES, SANS_ROLE, pool } = require('./roles-lib');

(async () => {
  const p = await pool();

  // Hash bcrypt inutilisable pour se connecter : ces comptes ne servent qu'à
  // l'API, via un jeton signé. Aucun mot de passe n'ouvre cette empreinte.
  const HASH = '$2b$10$' + 'x'.repeat(53);

  const cibles = [...ROLES, SANS_ROLE];
  const cree = [];

  for (const role of cibles) {
    const matricule = PREFIXE + role;
    const email = `${matricule.toLowerCase()}@test.invalid`;

    const existe = await p
      .request()
      .input('m', matricule)
      .query('SELECT id FROM sec_user WHERE matricule = @m');

    let id;
    if (existe.recordset.length > 0) {
      id = existe.recordset[0].id;
    } else {
      const ins = await p
        .request()
        .input('m', matricule)
        .input('e', email)
        .input('h', HASH)
        .query(`INSERT INTO sec_user (matricule, nom, prenom, email, mot_de_passe_hash, est_actif)
                OUTPUT INSERTED.id
                VALUES (@m, 'Test', 'Role', @e, @h, 1)`);
      id = ins.recordset[0].id;
    }

    if (role !== SANS_ROLE) {
      await p.request().input('u', id).input('r', role).query(
        `INSERT INTO sec_user_role (user_id, role_id)
         SELECT @u, r.id FROM sec_role r
         WHERE r.code = @r
           AND NOT EXISTS (SELECT 1 FROM sec_user_role x WHERE x.user_id = @u AND x.role_id = r.id)`,
      );
    }
    cree.push({ role, id, matricule, email });
  }

  // Contrôle : chaque compte ne doit porter QUE son rôle, sinon le test ment.
  const verif = await p.request().input('pfx', PREFIXE + '%').query(
    `SELECT u.matricule, COUNT(ur.role_id) AS nb_roles,
            STRING_AGG(r.code, '+') AS roles
     FROM sec_user u
     LEFT JOIN sec_user_role ur ON ur.user_id = u.id
     LEFT JOIN sec_role r ON r.id = ur.role_id
     WHERE u.matricule LIKE @pfx AND u.deleted_at IS NULL
     GROUP BY u.matricule ORDER BY u.matricule`,
  );

  console.table(cree);
  console.log('\n=== Contrôle : un seul rôle par compte ===');
  console.table(verif.recordset);

  const anomalies = verif.recordset.filter(
    (r) => r.nb_roles > 1 || (r.matricule.endsWith(SANS_ROLE) && r.nb_roles > 0),
  );
  console.log(anomalies.length === 0 ? 'OK.' : `!! ${anomalies.length} compte(s) mal formé(s)`);

  require('fs').writeFileSync(
    __dirname + '/comptes.json',
    JSON.stringify(cree, null, 2),
  );
  await p.close();
})().catch((e) => { console.error(e); process.exit(1); });
