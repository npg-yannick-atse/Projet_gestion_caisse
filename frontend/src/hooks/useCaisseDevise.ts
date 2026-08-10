import { useCallback } from 'react';
import type { Caisse } from '@/types/api';

/**
 * Appariement caisse ↔ devise pour la saisie d'un encaissement.
 *
 * Les deux sens sont proposés, mais AUCUN n'est imposé :
 *
 *  - choisir une caisse renseigne sa devise déclarée ;
 *  - choisir une devise présélectionne la caisse *seulement* s'il n'y en a
 *    qu'une seule qui la déclare.
 *
 * Pourquoi ne pas déduire systématiquement la caisse de la devise : une caisse
 * est un emplacement PHYSIQUE, pas une propriété de la monnaie. Les caisses
 * détiennent d'ailleurs déjà des devises autres que la leur — CI02, déclarée en
 * XOF, contient des dollars. Déduire l'un de l'autre enregistrerait l'argent
 * dans un coffre où il n'est pas, et la clôture ne tomberait plus juste.
 *
 * Le « une devise = une caisse » constaté aujourd'hui n'est pas une règle : rien
 * n'empêche d'ouvrir un second guichet dans la même monnaie. D'où la
 * présélection uniquement quand la réponse est sans ambiguïté.
 *
 * Les deux fonctions sont appelées depuis les gestionnaires de saisie, jamais
 * depuis un effet : deux effets qui se répondraient boucleraient l'un sur
 * l'autre, et l'écran corrigerait le choix du caissier dans son dos.
 */
export function useCaisseDevise(caissesOuvertes: Caisse[]) {
  /** Devise déclarée d'une caisse ('' si inconnue). */
  const deviseDeLaCaisse = useCallback(
    (caisseId: string): string =>
      String(caissesOuvertes.find((c) => String(c.id) === String(caisseId))?.deviseId ?? ''),
    [caissesOuvertes],
  );

  /** Caisses ouvertes déclarant cette devise. */
  const caissesPourDevise = useCallback(
    (deviseId: string): Caisse[] =>
      caissesOuvertes.filter((c) => String(c.deviseId) === String(deviseId)),
    [caissesOuvertes],
  );

  /**
   * Caisse à présélectionner pour une devise : son identifiant s'il n'y a qu'une
   * candidate, `null` sinon — zéro candidate comme plusieurs laissent le choix
   * au caissier.
   */
  const caisseEvidentePourDevise = useCallback(
    (deviseId: string): string | null => {
      const candidates = caissesPourDevise(deviseId);
      return candidates.length === 1 ? String(candidates[0].id) : null;
    },
    [caissesPourDevise],
  );

  return { deviseDeLaCaisse, caissesPourDevise, caisseEvidentePourDevise };
}
