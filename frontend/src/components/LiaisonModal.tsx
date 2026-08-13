import { useEffect, useMemo, useState } from 'react';
import { Link2, Search, X } from 'lucide-react';
import { apiErrorMessage } from '@/lib/utils';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { Button } from '@/components/ui/button';

export interface ElementLiable {
  id: string;
  code?: string | null;
  libelle: string;
}

/**
 * Choix d'un ENSEMBLE d'éléments à rattacher, dans un sens ou dans l'autre.
 *
 * Le même composant sert aux deux directions de la liaison nature comptable ↔
 * centre de coût : seuls le titre et les listes changent. On enregistre la
 * sélection complète en une fois plutôt qu'à chaque clic — un aller-retour par
 * case laisserait la base et l'écran en désaccord si l'un d'eux échouait.
 */
export function LiaisonModal({
  titre,
  sousTitre,
  elements,
  dejaLies,
  enCours,
  erreur,
  onEnregistrer,
  onFermer,
}: {
  titre: string;
  sousTitre?: string;
  elements: ElementLiable[] | undefined;
  dejaLies: ElementLiable[] | undefined;
  enCours: boolean;
  erreur?: unknown;
  onEnregistrer: (ids: string[]) => void;
  onFermer: () => void;
}) {
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [recherche, setRecherche] = useState('');
  const [initialise, setInitialise] = useState(false);

  // On n'amorce la sélection qu'une fois les liens existants chargés : partir
  // d'un ensemble vide puis enregistrer effacerait tout.
  useEffect(() => {
    if (dejaLies && !initialise) {
      setSelection(new Set(dejaLies.map((e) => String(e.id))));
      setInitialise(true);
    }
  }, [dejaLies, initialise]);

  const visibles = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    const liste = elements ?? [];
    if (!q) return liste;
    return liste.filter(
      (e) => e.libelle.toLowerCase().includes(q) || (e.code ?? '').toLowerCase().includes(q),
    );
  }, [elements, recherche]);

  const basculer = (id: string) => {
    setSelection((prec) => {
      const suivant = new Set(prec);
      if (suivant.has(id)) suivant.delete(id);
      else suivant.add(id);
      return suivant;
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center"
      onClick={onFermer}
    >
      <div className="w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
        <Panel>
          <PanelHeader title={titre}>
            <button
              type="button"
              aria-label="Fermer"
              onClick={onFermer}
              className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-[7px] text-[#94A3B8] hover:bg-[#F1F5F9]"
            >
              <X className="h-4 w-4" />
            </button>
          </PanelHeader>

          {sousTitre && <p className="px-[18px] pt-3 text-[11px] text-[#64748B]">{sousTitre}</p>}

          <div className="flex items-center gap-2 px-[18px] py-3">
            <Search className="h-4 w-4 shrink-0 text-[#64748B]" />
            <input
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Rechercher…"
              className="w-full rounded-[9px] border border-[rgba(15,76,129,0.1)] bg-[#F8FAFC] px-3 py-1.5 text-xs text-[#0F172A] outline-none focus:border-[#1A6DB5] focus:bg-white"
            />
            <span className="shrink-0 rounded-full bg-[#EFF6FF] px-2 py-0.5 text-[10px] font-semibold text-[#1A6DB5]">
              {selection.size} lié{selection.size > 1 ? 's' : ''}
            </span>
          </div>

          <div className="max-h-[45vh] overflow-y-auto border-y border-[rgba(15,76,129,0.07)]">
            {!elements && <p className="px-[18px] py-8 text-sm text-[#64748B]">Chargement…</p>}
            {elements && visibles.length === 0 && (
              <p className="px-[18px] py-8 text-center text-sm text-[#64748B]">
                {recherche ? 'Aucun résultat.' : 'Rien à rattacher.'}
              </p>
            )}
            {visibles.map((e) => (
              <label
                key={e.id}
                className="flex cursor-pointer items-center gap-3 px-[18px] py-2 hover:bg-[#F8FAFC]"
              >
                <input
                  type="checkbox"
                  checked={selection.has(String(e.id))}
                  onChange={() => basculer(String(e.id))}
                  className="h-4 w-4"
                />
                <span className="flex-1 text-xs">
                  {e.code && <span className="mr-2 font-mono text-[#0F172A]">{e.code}</span>}
                  <span className="text-[#334155]">{e.libelle}</span>
                </span>
              </label>
            ))}
          </div>

          <div className="flex items-center gap-2 p-[18px]">
            <Button
              type="button"
              disabled={enCours || !initialise}
              onClick={() => onEnregistrer([...selection])}
            >
              <Link2 className="mr-1.5 h-3.5 w-3.5" />
              {enCours ? 'Enregistrement…' : 'Enregistrer les liens'}
            </Button>
            <Button type="button" variant="ghost" onClick={onFermer}>
              Annuler
            </Button>
            {!!erreur && (
              <p className="text-sm text-destructive">{apiErrorMessage(erreur, 'Enregistrement impossible')}</p>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}
