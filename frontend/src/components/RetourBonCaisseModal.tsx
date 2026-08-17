import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiErrorMessage, formatMontant } from '@/lib/utils';
import { useRemboursables, useCreateRemboursementDepuisCaisse } from '@/api/remboursementsBon';

const selectClass =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/**
 * Retour d'un bon, saisi depuis l'écran des mouvements.
 *
 * C'est bien une entrée d'argent en caisse, et le caissier qui la reçoit est
 * ici — pas dans la page d'un bon. Mais ce n'est PAS un encaissement libre : un
 * retour se rattache à un sous-bon précis, sinon la règle « on ne rend pas plus
 * qu'on n'a reçu » ne tient plus. On rend donc le sous-bon choisissable plutôt
 * que de laisser saisir un montant dans le vide.
 *
 * Seuls les sous-bons ayant encore quelque chose à rendre sont proposés — la
 * liste est calculée en base, décaissé moins déjà rendu.
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

  const [sousBonId, setSousBonId] = useState('');
  const [montant, setMontant] = useState('');
  const [motif, setMotif] = useState('');

  const choisi = useMemo(
    () => (remboursables ?? []).find((r) => String(r.sousBonId) === String(sousBonId)),
    [remboursables, sousBonId],
  );

  const reste = Number(choisi?.reste ?? 0);
  const valeur = Number(montant);
  const tropEleve = !!choisi && montant !== '' && Number.isFinite(valeur) && valeur > reste;
  const valide = !!choisi && montant !== '' && Number.isFinite(valeur) && valeur > 0 && !tropEleve;

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

        {!isLoading && (remboursables ?? []).length === 0 && (
          <p className="rounded-[9px] bg-[#F8FAFC] px-3 py-2.5 text-[11px] text-[#64748B]">
            Aucun bon décaissé n'a de reste à rendre
            {caisseId ? ' sur cette caisse' : ''}. Un retour n'est possible qu'après un
            décaissement.
          </p>
        )}

        {!isLoading && (remboursables ?? []).length > 0 && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="ret-sousbon">Sous-bon décaissé</Label>
              <select
                id="ret-sousbon"
                className={selectClass}
                value={sousBonId}
                onChange={(e) => {
                  setSousBonId(e.target.value);
                  setMontant('');
                }}
              >
                <option value="">— Choisir —</option>
                {(remboursables ?? []).map((r) => (
                  <option key={r.sousBonId} value={r.sousBonId}>
                    {r.numero} · {r.libelle} · reste {formatMontant(r.reste)} {r.deviseCode}
                  </option>
                ))}
              </select>
            </div>

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
