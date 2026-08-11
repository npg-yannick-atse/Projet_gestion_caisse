/**
 * Explique pourquoi aucune caisse n'est sélectionnable.
 *
 * Deux situations très différentes se cachaient derrière un unique « Aucune
 * caisse ouverte » :
 *
 *   - les caisses attribuées sont toutes FERMÉES → il faut en ouvrir une ;
 *   - AUCUNE caisse n'est attribuée à l'utilisateur → il lui manque un droit.
 *
 * Le second cas est le plus déroutant : les caisses sont bien ouvertes à
 * l'écran des caisses, mais absentes ici. Une testeuse l'a signalé comme un
 * défaut d'affichage le 11/08/2026, alors qu'il s'agissait d'une habilitation
 * manquante. Nommer la vraie cause évite de chercher au mauvais endroit.
 */
export function AucuneCaisseMessage({
  /** Caisses du périmètre de l'utilisateur, tous statuts confondus. */
  caisses,
  /** Sous-ensemble réellement ouvert. */
  openCaisses,
}: {
  caisses: unknown[] | undefined;
  openCaisses: unknown[];
}) {
  if (openCaisses.length > 0) return null;

  // `caisses` indéfini = périmètre pas encore chargé : on n'affirme rien.
  if (caisses && caisses.length === 0) {
    return (
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
