import type { FrequenceRecurrence } from './entities/bon.entity';

/** Nombre de mois séparant deux échéances. */
const MOIS_PAR_FREQUENCE: Record<FrequenceRecurrence, number> = {
  MENSUEL: 1,
  TRIMESTRIEL: 3,
  SEMESTRIEL: 6,
  ANNUEL: 12,
};

/** Dernier jour du mois donné (année, mois 0-11). */
function dernierJourDuMois(annee: number, mois: number): number {
  // Le jour 0 du mois suivant EST le dernier jour du mois courant.
  return new Date(Date.UTC(annee, mois + 1, 0)).getUTCDate();
}

/**
 * Échéance suivante d'un bon récurrent.
 *
 * Le piège est le dernier jour du mois. `setMonth(mois + 1)` sur le 31 janvier
 * donne le 3 mars : février n'ayant pas de 31, JavaScript déborde sur le mois
 * d'après. Un bon mensuel signé le 31 janvier sauterait donc février, puis
 * dériverait de mois en mois.
 *
 * On ramène donc le jour au dernier jour du mois visé quand il n'existe pas :
 * 31 janvier → 28 février (29 en année bissextile) → 31 mars. Le rappel reste
 * accroché à la fin de mois, ce qu'attend quiconque a choisi le 31.
 *
 * Les dates sont manipulées en UTC : une échéance est un JOUR, pas un instant,
 * et le décalage local ferait basculer un 1er du mois au 31 précédent.
 */
export function prochaineEcheance(depuis: Date, frequence: FrequenceRecurrence): Date {
  const pas = MOIS_PAR_FREQUENCE[frequence];
  const annee = depuis.getUTCFullYear();
  const mois = depuis.getUTCMonth();
  const jour = depuis.getUTCDate();

  const cibleMois = mois + pas;
  const cibleAnnee = annee + Math.floor(cibleMois / 12);
  const moisNormalise = ((cibleMois % 12) + 12) % 12;

  const jourMax = dernierJourDuMois(cibleAnnee, moisNormalise);
  return new Date(Date.UTC(cibleAnnee, moisNormalise, Math.min(jour, jourMax)));
}

/**
 * Reporte l'échéance jusqu'à ce qu'elle repasse dans le futur.
 *
 * Un serveur arrêté une semaine — ou un bon trimestriel oublié six mois —
 * laisserait sinon une échéance périmée : le job la verrait « atteinte » à
 * chaque passage et notifierait tous les jours. On avance donc d'autant de
 * périodes qu'il faut, sans jamais notifier plus d'une fois.
 *
 * Le garde-fou de 500 tours n'est pas décoratif : une fréquence inconnue
 * donnerait un pas de zéro et une boucle infinie dans un job planifié.
 */
export function reporterApres(echeance: Date, frequence: FrequenceRecurrence, reference: Date): Date {
  let suivante = prochaineEcheance(echeance, frequence);
  let tours = 0;
  while (suivante.getTime() <= reference.getTime() && tours < 500) {
    const avant = suivante.getTime();
    suivante = prochaineEcheance(suivante, frequence);
    if (suivante.getTime() === avant) break; // pas nul : on s'arrête plutôt que de tourner
    tours++;
  }
  return suivante;
}

/** Vrai si la chaîne est une date ISO `YYYY-MM-DD` valide (et non un 31 février). */
export function estDateIso(valeur: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valeur)) return false;
  const [a, m, j] = valeur.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1, j));
  return d.getUTCFullYear() === a && d.getUTCMonth() === m - 1 && d.getUTCDate() === j;
}
