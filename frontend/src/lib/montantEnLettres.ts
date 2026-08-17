/**
 * Un montant écrit en toutes lettres, en français.
 *
 * Sur un reçu, ce n'est pas un ornement : c'est ce qui empêche d'ajouter un
 * zéro après coup. « 30 000 » se retouche, « TRENTE MILLE FRANCS » non.
 *
 * Les règles d'accord sont celles de l'orthographe française usuelle :
 *   - « quatre-vingts » prend un s SEUL ou en fin de nombre, pas suivi ;
 *   - « cent » prend un s au pluriel s'il termine le nombre (deux cents),
 *     jamais s'il est suivi (deux cent un) ;
 *   - « mille » est invariable ;
 *   - « million » et « milliard » sont des noms : ils s'accordent toujours.
 */

// Jusqu'à DIX-NEUF : 70-79 et 90-99 s'y adossent (soixante + dix-sept), donc
// s'arrêter à seize laissait « soixante-undefined » pour 77.
const UNITES = [
  'zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf',
  'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize',
  'dix-sept', 'dix-huit', 'dix-neuf',
];
const DIZAINES = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante', 'quatre-vingt', 'quatre-vingt'];

/** 0 à 99. */
function souscent(n: number): string {
  if (n < 17) return UNITES[n];
  const d = Math.floor(n / 10);
  const u = n % 10;

  // 70-79 et 90-99 se construisent sur soixante et quatre-vingt, avec dix à dix-neuf.
  if (d === 7 || d === 9) {
    const base = DIZAINES[d];
    const reste = UNITES[10 + u];
    // « soixante et onze », mais « quatre-vingt-onze » — pas de « et » sur 90.
    return d === 7 && u === 1 ? `${base} et ${reste}` : `${base}-${reste}`;
  }

  if (u === 0) {
    // « quatre-vingts » seul prend un s ; « soixante », « trente »… non.
    return d === 8 ? 'quatre-vingts' : DIZAINES[d];
  }
  // « vingt et un », « trente et un »… mais « quatre-vingt-un » sans « et ».
  if (u === 1 && d !== 8) return `${DIZAINES[d]} et un`;
  return `${DIZAINES[d]}-${UNITES[u]}`;
}

/**
 * 0 à 999.
 *
 * `devantMille` : « cent » ne prend PAS de s devant « mille », qui est un
 * adjectif numéral — on écrit « deux cent mille ». Il en prend un devant
 * « millions » et « milliards », qui sont des noms : « deux cents millions ».
 * Cette nuance est la faute la plus fréquente sur une pièce comptable.
 */
function souscentmille(n: number, devantMille = false): string {
  if (n < 100) return souscent(n);
  const c = Math.floor(n / 100);
  const reste = n % 100;
  const tete = c === 1 ? 'cent' : `${UNITES[c]} cent`;
  // « deux cents » avec s SEULEMENT si rien ne suit, et jamais devant mille.
  if (reste === 0) return c === 1 ? 'cent' : devantMille ? tete : `${tete}s`;
  return `${tete} ${souscent(reste)}`;
}

/** Partie entière, jusqu'aux milliards. */
function entierEnLettres(n: number): string {
  if (n === 0) return 'zéro';

  const tranches: Array<{ valeur: number; singulier: string; pluriel: string }> = [
    { valeur: 1_000_000_000, singulier: 'milliard', pluriel: 'milliards' },
    { valeur: 1_000_000, singulier: 'million', pluriel: 'millions' },
    { valeur: 1_000, singulier: 'mille', pluriel: 'mille' }, // invariable
  ];

  const morceaux: string[] = [];
  let reste = n;

  for (const t of tranches) {
    const combien = Math.floor(reste / t.valeur);
    if (combien === 0) continue;
    reste %= t.valeur;
    // « mille » et non « un mille » ; en revanche « un million » se dit.
    const quantite =
      combien === 1 && t.valeur === 1_000
        ? ''
        : `${souscentmille(combien, t.valeur === 1_000)} `;
    morceaux.push(`${quantite}${combien > 1 ? t.pluriel : t.singulier}`);
  }

  if (reste > 0) morceaux.push(souscentmille(reste));
  return morceaux.join(' ');
}

/** Nom de la monnaie, accordé, et celui de sa subdivision. */
const MONNAIES: Record<string, { un: string; plusieurs: string; centime: string; centimes: string }> = {
  XOF: { un: 'franc CFA', plusieurs: 'francs CFA', centime: 'centime', centimes: 'centimes' },
  XAF: { un: 'franc CFA', plusieurs: 'francs CFA', centime: 'centime', centimes: 'centimes' },
  EUR: { un: 'euro', plusieurs: 'euros', centime: 'centime', centimes: 'centimes' },
  USD: { un: 'dollar', plusieurs: 'dollars', centime: 'cent', centimes: 'cents' },
};

/**
 * « 30000 », « XOF » → « TRENTE MILLE FRANCS CFA ».
 *
 * Les décimales ne sont mentionnées QUE si elles existent : un montant en
 * francs CFA n'en a pas, et écrire « zéro centime » sur chaque reçu ferait du
 * bruit là où l'on cherche un chiffre.
 */
export function montantEnLettres(montant: string | number, codeDevise?: string | null): string {
  const valeur = Math.abs(Number(montant) || 0);
  const entier = Math.floor(valeur);
  // Arrondi AVANT comparaison : 0.1 + 0.2 en virgule flottante donnerait 29
  // centimes au lieu de 30.
  const centimes = Math.round((valeur - entier) * 100);

  const monnaie = MONNAIES[String(codeDevise ?? '').toUpperCase()];
  const nom = monnaie ? (entier > 1 ? monnaie.plusieurs : monnaie.un) : (codeDevise ?? '');

  let texte = `${entierEnLettres(entier)}${nom ? ` ${nom}` : ''}`;
  if (centimes > 0 && monnaie) {
    texte += ` et ${entierEnLettres(centimes)} ${centimes > 1 ? monnaie.centimes : monnaie.centime}`;
  }
  return texte.toUpperCase();
}
