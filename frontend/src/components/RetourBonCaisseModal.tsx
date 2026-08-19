import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiErrorMessage, formatMontant } from '@/lib/utils';
import {
  useRemboursables,
  useCreateRemboursementDepuisCaisse,
  type SousBonRemboursable,
} from '@/api/remboursementsBon';

const selectClass =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/**
 * Retour d'un bon, saisi depuis l'écran des mouvements.
 *
 * C'est bien une entrée d'argent en caisse, et le caissier qui la reçoit est
 * ici — pas dans la page d'un bon. Mais ce n'est PAS un encaissement libre : un
 * retour se rattache à une LIGNE de bon, sinon la règle « on ne rend pas plus
 * qu'on n'a reçu » ne tient plus.
 *
 * ON CHOISIT LE BON, PAS LA LIGNE. Le caissier tient un bon en main ;
 * « sous-bon » est un mot du modèle de données, pas du sien. La ligne ne lui est
 * demandée que lorsque le bon en a PLUSIEURS à rendre — quatre bons sur cinq
 * n'en ont qu'une, et poser une question à réponse unique n'est que de la
 * friction.
 *
 * L'écriture, elle, reste attachée à la ligne : c'est elle qui porte la caisse,
 * la devise et le centre de coût, et c'est elle qui a été décaissée.
 */
export function RetourBonCaisseModal({
  caisseId,
  onClose,
}: {
  caisseId?: string;
  onClose: () => void;
}) {
  const { data: remboursables, isLoading } = useRemboursables(caisseId);
  const creer = useCreateRemboursementDepuisCaisse();

  const [bonId, setBonId] = useState('');
  const [sousBonId, setSousBonId] = useState('');
  const [montant, setMontant] = useState('');
  const [motif, setMotif] = useState('');

  /** Les lignes rendables, regroupées par bon — l'unité que connaît le caissier. */
  const parBon = useMemo(() => {
    const map = new Map<
      string,
      { numero: string; deviseCode: string; lignes: SousBonRemboursable[]; reste: number }
    >();
    for (const r of remboursables ?? []) {
      const cle = String(r.bonId);
      const entree =
        map.get(cle) ?? { numero: r.numero, deviseCode: r.deviseCode, lignes: [], reste: 0 };
      entree.lignes.push(r);
      entree.reste += Number(r.reste);
      map.set(cle, entree);
    }
    return map;
  }, [remboursables]);

  const bonChoisi = bonId ? parBon.get(bonId) : undefined;
  const lignes = bonChoisi?.lignes ?? [];
  const choisi = lignes.find((l) => String(l.sousBonId) === String(sousBonId));

  const reste = Number(choisi?.reste ?? 0);
  const valeur = Number(montant);
  const tropEleve = !!choisi && montant !== '' && Number.isFinite(valeur) && valeur > reste;
  const valide = !!choisi && montant !== '' && Number.isFinite(valeur) && valeur > 0 && !tropEleve;

  const choisirBon = (id: string) => {
    setBonId(id);
    setMontant('');
    const l = parBon.get(id)?.lignes ?? [];
    // Sélection automatique quand il n'y a rien à départager.
    setSousBonId(l.length === 1 ? String(l[0].sousBonId) : '');
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center">
      <div className="w-full max-w-lg rounded-[14px] bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-bold text-[#0F172A]">Retour d'un bon</h2>
            <p className="text-[11px] text-[#64748B]">
              L'argent non dépensé revient en caisse. Le bon garde son montant : ce retour
              s'enregistre à côté.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-[#64748B] hover:text-[#0F172A]">
            <X className="h-4 w-4" />
          </button>
        </div>

        {isLoading && <p className="text-sm text-[#64748B]">Chargement…</p>}

        {!isLoading && parBon.size === 0 && (
          <p className="rounded-[9px] bg-[#F8FAFC] px-3 py-2.5 text-[11px] text-[#64748B]">
            Aucun bon décaissé n'a de reste à rendre
            {caisseId ? ' sur cette caisse' : ''}. Un retour n'est possible qu'après un
            décaissement.
          </p>
        )}

        {!isLoading && parBon.size > 0 && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="ret-bon">Bon</Label>
              <select
                id="ret-bon"
                className={selectClass}
                value={bonId}
                onChange={(e) => choisirBon(e.target.value)}
              >
                <option value="">— Choisir —</option>
                {[...parBon.entries()].map(([id, b]) => (
                  <option key={id} value={id}>
                    {b.numero} · reste {formatMontant(String(b.reste))} {b.deviseCode}
                    {b.lignes.length > 1 ? ` · ${b.lignes.length} lignes` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* La ligne n'est demandée que si le bon en a plusieurs à rendre. */}
            {lignes.length > 1 && (
              <div className="space-y-1.5">
                <Label htmlFor="ret-ligne">Ligne du bon</Label>
                <select
                  id="ret-ligne"
                  className={selectClass}
                  value={sousBonId}
                  onChange={(e) => {
                    setSousBonId(e.target.value);
                    setMontant('');
                  }}
                >
                  <option value="">— Choisir —</option>
                  {lignes.map((l) => (
                    <option key={l.sousBonId} value={l.sousBonId}>
                      {l.libelle} · reste {formatMontant(l.reste)} {l.deviseCode}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-[#94A3B8]">
                  Ce bon a été décaissé en plusieurs lignes : le retour se rattache à l'une d'elles.
                </p>
              </div>
            )}

            {/* Les trois chiffres qui décident : « combien puis-je rendre ? » ne
                se calcule pas de tête sur un bon déjà remboursé en partie. */}
            {choisi && (
              <div className="grid grid-cols-3 gap-2 rounded-[10px] bg-[#F8FAFC] p-3 text-center">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.6px] text-[#64748B]">Décaissé</div>
                  <div className="font-display text-sm font-bold text-[#0F172A]">
                    {formatMontant(choisi.decaisse)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.6px] text-[#64748B]">Déjà rendu</div>
                  <div className="font-display text-sm font-bold text-[#B45309]">
                    {formatMontant(choisi.rendu)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.6px] text-[#64748B]">Reste</div>
                  <div className="font-display text-sm font-bold text-[#047857]">
                    {formatMontant(choisi.reste)}
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="ret-montant">Montant rendu</Label>
              <Input
                id="ret-montant"
                inputMode="decimal"
                value={montant}
                onChange={(e) => setMontant(e.target.value)}
                placeholder="0"
                disabled={!choisi}
              />
              {tropEleve && (
                <p className="text-[11px] text-[#B42318]">
                  Vous ne pouvez pas rendre plus que ce qui est sorti — il reste{' '}
                  {formatMontant(String(reste))}.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ret-motif">Motif (optionnel)</Label>
              <Input
                id="ret-motif"
                value={motif}
                onChange={(e) => setMotif(e.target.value)}
                placeholder="Pourquoi cette part n'a pas été dépensée…"
                maxLength={500}
              />
            </div>

            {creer.isError && (
              <p className="text-sm text-destructive">
                {apiErrorMessage(creer.error, 'Enregistrement impossible')}
              </p>
            )}

            <div className="flex items-center gap-2 pt-1">
              <Button
                disabled={!valide || creer.isPending}
                onClick={() =>
                  creer.mutate(
                    { sousBonId, montant, motif: motif || undefined },
                    { onSuccess: () => onClose() },
                  )
                }
              >
                {creer.isPending ? 'Enregistrement…' : 'Enregistrer le retour'}
              </Button>
              <Button type="button" variant="ghost" onClick={onClose}>
                Annuler
              </Button>
            </div>

            <p className="text-[11px] text-[#94A3B8]">
              Un reçu de réception sera émis automatiquement.
            </p>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
