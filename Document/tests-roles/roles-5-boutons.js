/**
 * Confronte CE QUE CHAQUE ÉCRAN AFFICHE à CE QUE LE SERVEUR AUTORISE.
 *
 * Un bouton visible pour quelqu'un que le serveur refusera est un défaut : il
 * promet une action impossible. L'inverse — un bouton caché à quelqu'un qui y a
 * droit — en est un aussi : la fonction devient introuvable.
 *
 * SANS RISQUE : chaque action est appelée sur un identifiant INEXISTANT. La
 * garde de permission répond quand même (403 si refus), mais l'action ne peut
 * rien exécuter — aucun mouvement d'argent, aucune écriture.
 *
 * Lecture des résultats :
 *   403 / 401  → refusé par la garde
 *   404        → la garde a laissé passer (l'objet est introuvable, c'est voulu)
 *   400        → INCONCLUANT : la validation du corps s'exécute AVANT le
 *                contrôleur, la garde n'a donc jamais été atteinte
 *   autre      → la garde a laissé passer
 *
 * ⚠ DEUX PIÈGES, tombés dans les deux le 12/08/2026 :
 *
 *  1. Compter un 400 comme « autorisé ». C'est faux : le corps a été rejeté
 *    avant d'arriver à la garde. Ces cas sont désormais marqués INCONCLUANT.
 *
 *  2. Le service charge parfois l'objet AVANT de vérifier la permission
 *    (`findOne` puis `assertPermission`). Avec un identifiant inexistant, TOUS
 *    les rôles reçoivent alors 404 et le test ne mesure rien. C'est signalé
 *    « test muet » — il faut alors lire le code pour connaître la permission.
 */
const fs = require('fs');
const { jeton, ROLES, SANS_ROLE } = require('./roles-lib');

const BASE = 'http://localhost:8091/api/v1';
const ABSENT = 999999;

/**
 * `vus` = les rôles auxquels l'ÉCRAN montre le bouton, relevé dans le code du
 * frontend. `null` = aucune garde, le bouton est montré à tout le monde.
 */
const BOUTONS = [
  { ecran: 'Bons', bouton: 'Valider', m: 'POST', url: `/bons/${ABSENT}/validate`,
    body: { approuve: true }, vus: ['ADMINISTRATEUR', 'SUPER_ADMIN', 'DAF'] },
  { ecran: 'Bons', bouton: 'Décaisser', m: 'POST', url: `/bons/${ABSENT}/decaisser`,
    body: {}, vus: ['CAISSIER', 'ADMINISTRATEUR', 'SUPER_ADMIN', 'DAF'] },
  { ecran: 'Bons manuels', bouton: 'Nouveau carnet', m: 'POST', url: '/carnets',
    body: { libelle: 'x', numeroDebut: 1, numeroFin: 2, caisseId: String(ABSENT) },
    vus: ['ADMINISTRATEUR', 'SUPER_ADMIN'] },
  { ecran: 'Demandes de recharge', bouton: 'Recharger', m: 'POST', url: `/demandes-recharge/${ABSENT}/traiter`,
    body: {}, vus: ['CAISSIER', 'ADMINISTRATEUR', 'SUPER_ADMIN', 'DAF'] },
  { ecran: 'Demandes de recharge', bouton: 'Rejeter', m: 'POST', url: `/demandes-recharge/${ABSENT}/rejeter`,
    body: {}, vus: ['CAISSIER', 'ADMINISTRATEUR', 'SUPER_ADMIN', 'DAF'] },
  { ecran: 'Demandes de transfert', bouton: 'Approuver / Rejeter', m: 'POST', url: `/demandes-transfert/${ABSENT}/decision`,
    body: { approuve: true }, vus: ['GESTIONNAIRE_PORTEFEUILLE', 'ADMINISTRATEUR', 'SUPER_ADMIN', 'DAF'] },
  { ecran: 'Demandes de transfert', bouton: 'Exécuter', m: 'POST', url: `/demandes-transfert/${ABSENT}/execute`,
    body: {}, vus: ['GESTIONNAIRE_PORTEFEUILLE', 'ADMINISTRATEUR', 'SUPER_ADMIN', 'DAF'] },
  { ecran: 'Caisses', bouton: 'Ouvrir', m: 'POST', url: `/caisses/${ABSENT}/ouvrir`,
    body: {}, vus: ['CAISSIER', 'ADMINISTRATEUR', 'SUPER_ADMIN'] },
  { ecran: 'Caisses', bouton: 'Clôturer', m: 'POST', url: `/caisses/${ABSENT}/cloturer`,
    body: {}, vus: ['CAISSIER', 'ADMINISTRATEUR', 'SUPER_ADMIN'] },
  { ecran: 'Crédits', bouton: 'Approuver', m: 'POST', url: `/credits/${ABSENT}/approuver`,
    body: {}, vus: ['ADMINISTRATEUR', 'SUPER_ADMIN', 'DAF'] },
  { ecran: 'Crédits', bouton: 'Décaisser', m: 'POST', url: `/credits/${ABSENT}/traiter`,
    body: {}, vus: ['CAISSIER', 'ADMINISTRATEUR', 'SUPER_ADMIN', 'DAF'] },
  { ecran: 'Salaires', bouton: 'Payer', m: 'POST', url: '/paiements-salaire/payer',
    body: { employeId: String(ABSENT), periode: '2026-08', montant: '1', sourceType: 'CAISSE', sourceId: String(ABSENT) },
    vus: ['CAISSIER', 'ADMINISTRATEUR', 'SUPER_ADMIN', 'DAF'] },
  { ecran: 'Taux de change', bouton: 'Importer', m: 'POST', url: '/taux-change/importer',
    body: {}, vus: ['ADMINISTRATEUR', 'SUPER_ADMIN', 'DAF'] },
];

(async () => {
  const comptes = JSON.parse(fs.readFileSync(__dirname + '/comptes.json', 'utf8'));
  const lignes = [];
  const ecarts = [];

  for (const b of BOUTONS) {
    const autorises = [];
    const inconcluants = [];
    for (const compte of comptes) {
      const t = jeton(compte);
      let statut = 0;
      try {
        const r = await fetch(BASE + b.url, {
          method: b.m,
          headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(b.body ?? {}),
          signal: AbortSignal.timeout(20000),
        });
        statut = r.status;
      } catch {
        statut = 0;
      }
      // 400 = le corps a été rejeté avant la garde : on ne sait rien.
      if (statut === 400) inconcluants.push(compte.role);
      else if (statut !== 401 && statut !== 403) autorises.push(compte.role);
    }
    if (inconcluants.length > 0) {
      lignes.push({
        ecran: b.ecran,
        bouton: b.bouton,
        'voit le bouton': (b.vus ?? []).join(', '),
        'passe la garde': `INCONCLUANT (corps refusé pour ${inconcluants.length} rôle(s))`,
        verdict: '? à revoir',
      });
      continue;
    }

    const vus = b.vus ?? [...ROLES, SANS_ROLE];
    const voitSansDroit = vus.filter((r) => !autorises.includes(r));
    const droitSansBouton = autorises.filter((r) => !vus.includes(r));
    const muet = autorises.length === comptes.length && b.vus;

    const ligne = {
      ecran: b.ecran,
      bouton: b.bouton,
      'voit le bouton': vus.join(', ') || '(personne)',
      'passe la garde': autorises.join(', ') || '(personne)',
      verdict: muet
        ? '? test muet'
        : voitSansDroit.length === 0 && droitSansBouton.length === 0
          ? 'ok'
          : '!! ECART',
    };
    lignes.push(ligne);
    if (ligne.verdict === '!! ECART') {
      ecarts.push({ ...ligne, voitSansDroit, droitSansBouton });
    }
  }

  console.table(lignes);

  if (ecarts.length === 0) {
    console.log('\nAucun écart : chaque bouton est montré exactement à ceux qui peuvent agir.');
  } else {
    console.log(`\n!! ${ecarts.length} ÉCART(S) :\n`);
    for (const e of ecarts) {
      console.log(`  ${e.ecran} / ${e.bouton}`);
      if (e.voitSansDroit.length)
        console.log(`     voient le bouton mais seront REFUSÉS : ${e.voitSansDroit.join(', ')}`);
      if (e.droitSansBouton.length)
        console.log(`     ont le droit mais NE VOIENT PAS le bouton : ${e.droitSansBouton.join(', ')}`);
    }
  }
})().catch((e) => { console.error(e); process.exit(1); });
