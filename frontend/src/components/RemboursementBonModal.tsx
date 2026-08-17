import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiErrorMessage, formatMontant } from '@/lib/utils';
import type { SousBon } from '@/types/api';

/**
 * Rendre à la caisse la part non dépensée d'un sous-bon décaissé.
 *
 * L'écran montre les trois chiffres qui comptent — sorti, déjà rendu, reste —
 * parce que « combien puis-je rendre ? » est la seule question que se pose le
 * caissier, et qu'il n'a aucun moyen de la calculer de tête sur un bon qui a
 * déjà connu un remboursement partiel.
 */
export function RemboursementBonModal({
  sousBon,
  dejaRendu,
  onClose,
  onSubmit,
  busy,
  error,
}: {
  sousBon: SousBon;
  dejaRendu: string;
  onClose: () => void;
  onSubmit: (montant: string, motif?: string) => void;
  busy?: boolean;
  error?: unknown;
}) {
  const [montant, setMontant] = useState('');
  const [motif, setMotif] = useState('');

  // Le montant du sous-bon fait foi côté écran ; le SERVEUR, lui, se fonde sur
  // ce qui a réellement été décaissé (le caissier a pu ajuster à la baisse).
  // Un écart se traduira par un refus explicite, chiffres à l'appui.
  const sorti = Number(sousBon.montant ?? 0);
  const rendu = Number(dejaRendu ?? 0);
  const reste = sorti - rendu;

  const valeur = Number(montant);
  const valide = montant !== '' && Number.isFinite(valeur) && valeur > 0 && valeur <= reste;
  const tropEleve = montant !== '' && Number.isFinite(valeur) && valeur > reste;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center">
      <div className="w-full max-w-lg rounded-[14px] bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-bold text-[#0F172A]">Rendre de l'argent à la caisse</h2>
            <p className="text-[11px] text-[#64748B]">
              {sousBon.libelle} — le bon garde son montant, ce retour s'enregistre à côté.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-[#64748B] hover:text-[#0F172A]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-4 grid grid-cols-3 gap-2 rounded-[10px] bg-[#F8FAFC] p-3 text-center">
          <div>
            <div className="text-[10px] uppercase tracking-[0.6px] text-[#64748B]">Décaissé</div>
            <div className="font-display text-sm font-bold text-[#0F172A]">{formatMontant(String(sorti))}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.6px] text-[#64748B]">Déjà rendu</div>
            <div className="font-display text-sm font-bold text-[#B45309]">{formatMontant(String(rendu))}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.6px] text-[#64748B]">Reste</div>
            <div className="font-display text-sm font-bold text-[#047857]">{formatMontant(String(reste))}</div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="remb-montant">Montant rendu</Label>
            <Input
              id="remb-montant"
              inputMode="decimal"
              value={montant}
              onChange={(e) => setMontant(e.target.value)}
              placeholder="0"
            />
            {tropEleve && (
              <p className="text-[11px] text-[#B42318]">
                Vous ne pouvez pas rendre plus que ce qui est sorti — il reste {formatMontant(String(reste))}.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="remb-motif">Motif (optionnel)</Label>
            <Input
              id="remb-motif"
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              placeholder="Pourquoi cette part n'a pas été dépensée…"
              maxLength={500}
            />
          </div>

          {error != null && (
            <p className="text-sm text-destructive">{apiErrorMessage(error, 'Enregistrement impossible')}</p>
          )}

          <div className="flex items-center gap-2 pt-1">
            <Button disabled={!valide || busy} onClick={() => onSubmit(montant, motif || undefined)}>
              {busy ? 'Enregistrement…' : 'Enregistrer le retour'}
            </Button>
            <Button type="button" variant="ghost" onClick={onClose}>
              Annuler
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
