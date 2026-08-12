/**
 * Briques communes au test rôle par rôle.
 * Les comptes créés portent tous le préfixe TEST-ROLE- : c'est la seule marque
 * qui sert au nettoyage, elle ne doit jamais changer.
 */
const fs = require('fs');
const path = require('path');

const RACINE = 'd:/Users/yannick.atse/Documents/Projet_gestion_caisse';
const BACK = `${RACINE}/backend`;
const sql = require(`${BACK}/node_modules/mssql`);
const jwt = require(`${BACK}/node_modules/jsonwebtoken`);

const PREFIXE = 'TEST-ROLE-';

const ROLES = [
  'SUPER_ADMIN',
  'ADMINISTRATEUR',
  'DAF',
  'CAISSIER',
  'VALIDATEUR',
  'GESTIONNAIRE_PORTEFEUILLE',
  'DEMANDEUR',
];
/** Témoin : un compte sans aucun rôle. Tout doit lui être refusé. */
const SANS_ROLE = 'AUCUN';

function env() {
  const e = {};
  for (const l of fs.readFileSync(path.join(BACK, '.env'), 'utf8').split(/\r?\n/)) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) e[m[1]] = m[2].trim();
  }
  return e;
}

function pool() {
  const e = env();
  return sql.connect({
    server: e.DB_HOST,
    port: +e.DB_PORT,
    user: e.DB_USER,
    password: e.DB_PASS,
    database: e.DB_NAME,
    options: { encrypt: false, trustServerCertificate: true },
    requestTimeout: 60000,
  });
}

/** Jeton signé avec le secret de l'application. `validate()` ne consulte pas la base. */
function jeton(user) {
  const e = env();
  return jwt.sign(
    { sub: String(user.id), matricule: user.matricule, email: user.email },
    e.JWT_SECRET,
    { expiresIn: '2h' },
  );
}

module.exports = { RACINE, BACK, PREFIXE, ROLES, SANS_ROLE, env, pool, jeton, sql };
