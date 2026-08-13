import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Coins, Pencil, Plus, Power, PowerOff } from 'lucide-react';
import { useDevises, useCreateDevise, useUpdateDevise } from '@/api/financierRef';
import { useParametres } from '@/api/parametres';
import { useMyPermissions } from '@/api/users';
import { useAuthStore } from '@/stores/auth.store';
import { apiErrorMessage, cn } from '@/lib/utils';
import type { Devise } from '@/types/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Pill } from '@/components/ui/pill';

const schema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, 'Code ISO de 3 lettres (ex. XOF, EUR, GHS)'),
  libelle: z.string().trim().min(1, 'Requis'),
  symbole: z.string().trim().optional(),
  nbDecimales: z.string().trim().regex(/^[0-4]$/, 'Entre 0 et 4'),
});
type FormValues = z.infer<typeof schema>;

function DeviseForm({ devise, onDone }: { devise?: Devise; onDone: () => void }) {
  const isEdit = !!devise;
  const create = useCreateDevise();
  const update = useUpdateDevise();
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: devise
      ? {
          code: devise.code,
          libelle: devise.libelle,
          symbole: devise.symbole ?? '',
          nbDecimales: String(devise.nbDecimales),
        }
      : { code: '', libelle: '', symbole: '', nbDecimales: '2' },
  });

  const pending = create.isPending || update.isPending;
  const mutError = create.error || update.error;
  const hasError = create.isError || update.isError;
  const decimales = Number(watch('nbDecimales') || 0);

  const onSubmit = handleSubmit((values) => {
    const commun = {
      libelle: values.libelle,
      symbole: values.symbole || null,
      nbDecimales: Number(values.nbDecimales),
    };
    if (isEdit) {
      // Le code n'est pas modifiable : il sert de clé de rapprochement avec SAP
      // et l'API de cotation, et il est recopié dans l'historique.
      update.mutate({ id: devise!.id, payload: commun }, { onSuccess: onDone });
    } else {
      create.mutate({ code: values.code, ...commun }, { onSuccess: onDone });
    }
  });

  return (
    <Panel>
      <PanelHeader title={isEdit ? `Modifier « ${devise!.code} »` : 'Nouvelle devise'} />
      <form onSubmit={onSubmit} className="grid gap-4 p-[18px] sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="dev-code">Code ISO</Label>
          <Input id="dev-code" placeholder="Ex : GHS" maxLength={3} disabled={isEdit} {...register('code')} />
          {errors.code ? (
            <p className="text-sm text-destructive">{errors.code.message}</p>
          ) : (
            <p className="text-[11px] text-[#94A3B8]">
              {isEdit ? 'Non modifiable : il relie la devise à SAP et à l’historique.' : 'Trois lettres majuscules.'}
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dev-libelle">Libellé</Label>
          <Input id="dev-libelle" placeholder="Ex : Cedi ghanéen" {...register('libelle')} />
          {errors.libelle && <p className="text-sm text-destructive">{errors.libelle.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dev-symbole">Symbole — optionnel</Label>
          <Input id="dev-symbole" placeholder="Ex : GH₵" maxLength={10} {...register('symbole')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dev-decimales">Nombre de décimales</Label>
          <Input id="dev-decimales" inputMode="numeric" maxLength={1} {...register('nbDecimales')} />
          {errors.nbDecimales ? (
            <p className="text-sm text-destructive">{errors.nbDecimales.message}</p>
          ) : (
            <p className="text-[11px] text-[#94A3B8]">
              Exemple d’arrondi : 1 234,5678 s’enregistrera{' '}
              <strong>{(1234.5678).toFixed(Number.isFinite(decimales) ? decimales : 2)}</strong>.
            </p>
          )}
        </div>

        <div className="sm:col-span-2 rounded-[9px] border border-[#FDE68A] bg-[#FFFBEB] p-3 text-[11px] text-[#92400E]">
          Le nombre de décimales gouverne l’arrondi de toutes les conversions vers cette devise, et cet arrondi
          est figé dans chaque écriture. Il se <strong>verrouille dès la première écriture</strong> : au-delà, il
          faudra créer une autre devise.
        </div>

        <div className="flex items-center gap-2 sm:col-span-2">
          <Button type="submit" disabled={pending}>
            {pending ? 'Enregistrement…' : isEdit ? 'Enregistrer' : 'Créer'}
          </Button>
          <Button type="button" variant="ghost" onClick={onDone}>
            Annuler
          </Button>
          {hasError && (
            <p className="text-sm text-destructive">
              {apiErrorMessage(mutError, isEdit ? 'Modification impossible' : 'Création impossible')}
            </p>
          )}
        </div>
      </form>
    </Panel>
  );
}

export function DevisesPage() {
  // `true` : l'écran d'administration doit voir les devises désactivées pour
  // pouvoir les réactiver. Le filtre est fait en base, pas ici.
  const { data: devises, isLoading, isError } = useDevises(true);
  const { data: parametres } = useParametres();
  const user = useAuthStore((s) => s.user);
  const { data: perms } = useMyPermissions(user?.id ?? null);
  const peutGerer = new Set(perms ?? []).has('DEVISE_GERER');

  const update = useUpdateDevise();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Devise | null>(null);
  const [pendingToggle, setPendingToggle] = useState<Devise | null>(null);

  const codeReference = parametres?.find((p) => p.cle === 'DEVISE_REFERENCE')?.valeur ?? 'XOF';

  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
  };

  return (
    <div className="flex flex-col gap-4">
      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center"
          onClick={closeForm}
        >
          <div className="w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <DeviseForm key={editing?.id ?? 'new'} devise={editing ?? undefined} onDone={closeForm} />
          </div>
        </div>
      )}

      <Panel>
        <PanelHeader title="Devises" badge={`${devises?.length ?? 0}`}>
          {peutGerer && (
            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setShowForm(true);
              }}
              className="ml-auto flex items-center gap-1.5 rounded-[9px] bg-[#0F4C81] px-3.5 py-1.5 text-[11px] font-medium text-white transition hover:bg-[#1A6DB5]"
            >
              <Plus className="h-4 w-4" /> Nouvelle devise
            </button>
          )}
        </PanelHeader>

        {isLoading && <div className="px-[18px] py-8 text-sm text-[#64748B]">Chargement…</div>}
        {isError && <div className="px-[18px] py-8 text-sm text-[#EF4444]">Impossible de charger les devises.</div>}

        {devises && (
          <table className="w-full text-xs">
            <thead className="bg-[#F8FAFC]">
              <tr className="text-left text-[10px] uppercase tracking-[0.7px] text-[#64748B]">
                <th className="px-4 py-2.5 font-semibold">Code</th>
                <th className="px-4 py-2.5 font-semibold">Libellé</th>
                <th className="px-4 py-2.5 font-semibold">Symbole</th>
                <th className="px-4 py-2.5 font-semibold">Décimales</th>
                <th className="px-4 py-2.5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {devises.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-[#64748B]">
                    Aucune devise. L’application ne peut pas fonctionner sans au moins la devise de référence.
                  </td>
                </tr>
              )}
              {devises.map((d) => {
                const estReference = d.code === codeReference;
                const inactive = d.estActif === false;
                return (
                  <tr
                    key={d.id}
                    className={cn(
                      'border-t border-[rgba(15,76,129,0.07)] hover:bg-[#FAFBFF]',
                      inactive && 'opacity-50',
                    )}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium">{d.code}</span>
                        {estReference && <Pill tone="blue">Référence</Pill>}
                        {inactive && <Pill tone="gray">Désactivée</Pill>}
                      </div>
                    </td>
                    <td className="px-4 py-3">{d.libelle}</td>
                    <td className="px-4 py-3 text-[#64748B]">{d.symbole || '—'}</td>
                    <td className="px-4 py-3 tabular-nums">{d.nbDecimales}</td>
                    <td className="px-4 py-3 text-right">
                      {peutGerer && (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            aria-label="Modifier"
                            title="Modifier"
                            onClick={() => {
                              setEditing(d);
                              setShowForm(true);
                            }}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-[7px] text-[#94A3B8] transition-colors hover:bg-[#EFF6FF] hover:text-[#1A6DB5]"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            aria-label={inactive ? 'Activer' : 'Désactiver'}
                            title={
                              estReference
                                ? 'La devise de référence ne peut pas être désactivée'
                                : inactive
                                  ? 'Activer'
                                  : 'Désactiver'
                            }
                            disabled={estReference && !inactive}
                            onClick={() => setPendingToggle(d)}
                            className={cn(
                              'inline-flex h-7 w-7 items-center justify-center rounded-[7px] transition-colors disabled:opacity-30',
                              inactive
                                ? 'text-[#94A3B8] hover:bg-[#ECFDF5] hover:text-[#059669]'
                                : 'text-[#94A3B8] hover:bg-[#FEF2F2] hover:text-[#EF4444]',
                            )}
                          >
                            {inactive ? <Power className="h-3.5 w-3.5" /> : <PowerOff className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Panel>

      <div className="space-y-1 px-1 text-[11px] text-[#94A3B8]">
        <p className="flex items-start gap-1.5">
          <Coins className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>
            Une devise ne se supprime pas, elle se <strong>désactive</strong> : ses écritures passées doivent
            rester lisibles. La désactivation est refusée tant qu’une caisse ou un portefeuille la déclare.
          </span>
        </p>
        <p>
          La devise de référence (<strong>{codeReference}</strong>) sert de pivot à toutes les conversions : pour
          passer d’EUR à USD, l’application convertit EUR → {codeReference} → USD. Elle se change dans les
          réglages globaux, via <strong>DEVISE_REFERENCE</strong>.
        </p>
      </div>

      <ConfirmDialog
        open={!!pendingToggle}
        variant={pendingToggle?.estActif === false ? 'success' : 'warning'}
        icon={pendingToggle?.estActif === false ? Power : PowerOff}
        title={
          pendingToggle
            ? pendingToggle.estActif === false
              ? `Activer ${pendingToggle.code} ?`
              : `Désactiver ${pendingToggle.code} ?`
            : ''
        }
        description={
          pendingToggle?.estActif === false
            ? 'Elle redeviendra proposable pour les caisses, les portefeuilles et les encaissements.'
            : 'Elle ne sera plus proposée nulle part. Les écritures déjà libellées dans cette devise restent intactes.'
        }
        confirmLabel={pendingToggle?.estActif === false ? 'Activer' : 'Désactiver'}
        busy={update.isPending}
        error={update.isError ? apiErrorMessage(update.error, 'Opération impossible') : undefined}
        onCancel={() => {
          setPendingToggle(null);
          update.reset();
        }}
        onConfirm={() => {
          if (!pendingToggle) return;
          update.mutate(
            { id: pendingToggle.id, payload: { estActif: pendingToggle.estActif === false } },
            { onSuccess: () => setPendingToggle(null) },
          );
        }}
      />
    </div>
  );
}
