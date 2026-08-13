import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { apiErrorMessage } from '@/lib/utils';

/**
 * Copie des permissions d'un rôle vers un profil, ou l'inverse.
 *
 * Le code et le libellé sont DEMANDÉS et non déduits : deux copies d'une même
 * source doivent pouvoir coexister, et un code sert d'identité durable — pas de
 * sous-produit d'une génération.
 */
export function GenererDepuisModal({
  titre,
  sourceLibelle,
  nbPermissions,
  avertissement,
  pending,
  error,
  onValider,
  onClose,
}: {
  titre: string;
  sourceLibelle: string;
  nbPermissions: number;
  avertissement?: string;
  pending: boolean;
  error: unknown;
  onValider: (code: string, libelle: string) => void;
  onClose: () => void;
}) {
  const [code, setCode] = useState('');
  const [libelle, setLibelle] = useState('');
  const valide = code.trim().length > 0 && libelle.trim().length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center"
      onClick={onClose}
    >
      <div className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <Panel>
          <PanelHeader title={titre} />
          <div className="space-y-4 p-[18px]">
            <p className="text-xs text-[#475569]">
              Source : <strong>{sourceLibelle}</strong> — {nbPermissions} permission
              {nbPermissions > 1 ? 's' : ''} seront recopiées.
            </p>
            {avertissement && (
              <p className="rounded-[9px] border border-[#FDE68A] bg-[#FFFBEB] px-3 py-2 text-[11px] text-[#78350F]">
                {avertissement}
              </p>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="gen-code">Code</Label>
              <Input id="gen-code" value={code} onChange={(e) => setCode(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gen-libelle">Libellé</Label>
              <Input id="gen-libelle" value={libelle} onChange={(e) => setLibelle(e.target.value)} />
            </div>
            <p className="text-[11px] text-[#94A3B8]">
              Copie ponctuelle : la cible n'évoluera pas si la source change ensuite.
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                disabled={!valide || pending}
                onClick={() => onValider(code.trim(), libelle.trim())}
              >
                {pending ? 'Création…' : 'Générer'}
              </Button>
              <Button type="button" variant="ghost" onClick={onClose}>
                Annuler
              </Button>
              {error != null && (
                <p className="text-sm text-destructive">
                  {apiErrorMessage(error, 'Génération impossible')}
                </p>
              )}
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
