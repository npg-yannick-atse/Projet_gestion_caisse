/**
 * Explique pourquoi aucune caisse n'est sélectionnable.
 *
 * Trois situations très différentes se cachaient derrière un unique « Aucune
 * caisse ouverte » :
 *
 *   - les caisses attribuées sont toutes FERMÉES → il faut en ouvrir une ;
 *   - AUCUNE caisse n'est attribuée à l'utilisateur → il lui manque un droit ;
 *   - il n'existe AUCUNE caisse dans l'application → il faut en créer une.
 *
 * Le deuxième cas est le plus déroutant : les caisses sont bien ouvertes à
 * l'écran des caisses, mais absentes ici. Une testeuse l'a signalé comme un
 * défaut d'affichage le 11/08/2026, alors qu'il s'agissait d'une habilitation
 * manquante. Nommer la vraie cause évite de chercher au mauvais endroit.
 *
 * Le troisième a été confondu avec le deuxième : un administrateur, qui n'a par
 * définition aucune restriction de périmètre, se voyait reprocher un droit
 * manquant alors que la base ne contenait simplement plus de caisse. Une liste
 * vide n'a pas le même sens selon qu'on filtre ou non.
 */
export function AucuneCaisseMessage({
  /** Caisses du périmètre de l'utilisateur, tous statuts confondus. */
  caisses,
  /** Sous-ensemble réellement ouvert. */
  openCaisses,
  /** Un administrateur voit toutes les caisses : sa liste vide signifie qu'il n'y en a aucune. */
  estAdmin,
}: {
  caisses: unknown[] | undefined;
  openCaisses: unknown[];
  estAdmin?: boolean;
}) {
  if (openCaisses.length > 0) return null;

  // `caisses` indéfini = périmètre pas encore chargé : on n'affirme rien.
  if (caisses && caisses.length === 0) {
    return estAdmin ? (
      <p className="text-[11px] text-[#B45309]">
        Aucune caisse n’existe dans l’application. Créez-en une depuis l’écran Caisses.
      </p>
    ) : (
      <p className="text-[11px] text-[#B45309]">
        Aucune caisse ne vous est attribuée. Demandez à un administrateur de vous donner accès
        à une caisse.
      </p>
    );
  }
  return (
    <p className="text-[11px] text-[#64748B]">Aucune caisse ouverte. Ouvrez une caisse d'abord.</p>
  );
}
