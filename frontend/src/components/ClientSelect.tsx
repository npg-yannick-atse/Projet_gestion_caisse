import { listPartenaires } from '@/api/referentiel';
import { RemoteSearchableSelect, type SelectOption } from '@/components/ui/searchable-select';

/**
 * Sélecteur de client avec autocomplétion, alimenté par la BASE LOCALE.
 *
 * Les clients sont importés de SAP (écran Master Data → Clients) : inutile
 * d'interroger SAP à chaque saisie. On y gagne la rapidité, le fonctionnement
 * même si la liaison SAP est indisponible, et la certitude que le numéro saisi
 * existe — puisqu'il est choisi dans une liste et non tapé à la main.
 *
 * La valeur manipulée reste le NUMÉRO client (KUNNR), pas l'identifiant interne
 * du partenaire : c'est lui qui est stocké sur les sous-bons et les opérations,
 * et transmis à SAP lors de la comptabilisation.
 */
export function ClientSelect({
  value,
  onChange,
  disabled,
  placeholder = 'Rechercher un client (nom ou numéro)…',
}: {
  /** Numéro client actuellement retenu (chaîne vide si aucun). */
  value: string;
  /** Reçoit le numéro client, et la raison sociale quand elle est connue. */
  onChange: (numeroClient: string, raisonSociale?: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  // La recherche serveur porte déjà sur la raison sociale, le code et le numéro
  // client : taper « KOUASSI » ou « 4111000535 » fonctionne indifféremment.
  const fetcher = (q: string): Promise<SelectOption[]> =>
    listPartenaires({ type: 'CLIENT', search: q || undefined, limit: 30 }).then((clients) =>
      clients
        // Un client sans numéro SAP ne peut pas être imputé : on ne le propose pas.
        .filter((c) => c.numeroClient)
        .map((c) => ({
          value: String(c.numeroClient),
          label: c.raisonSociale,
          hint: String(c.numeroClient),
          data: c,
        })),
    );

  return (
    <RemoteSearchableSelect
      value={value}
      selectedLabel={value || undefined}
      onChange={(numero, option) => onChange(numero, option?.label)}
      fetcher={fetcher}
      queryKey="clients-autocomplete"
      placeholder={placeholder}
      disabled={disabled}
    />
  );
}
