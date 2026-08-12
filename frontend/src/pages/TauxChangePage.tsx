import { Fragment, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Download,
  Lock,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import {
  useTauxCourants,
  useDeviseReference,
  useHistoriqueTaux,
  useCreateTaux,
  useImporterTaux,
  useDeleteTaux,
} from '@/api/tauxChange';
import { useDevises } from '@/api/financierRef';
import { useMyPermissions } from '@/api/users';
import { useAuthStore } from '@/stores/auth.store';
import { apiErrorMessage, ageLabel } from '@/lib/utils';
import type { LigneImportTaux, RapportImportTaux, TauxCourant } from '@/types/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { ConfirmDialog } from '@/components/ConfirmDialog';

/**
 * Le taux est un DECIMAL(19,8) strictement positif. Les bornes reprennent
 * `taux.validator` côté serveur, qui reste l'autorité — ceci n'est qu'un
 * confort de saisie qui évite un aller-retour pour une virgule.
 */
const schema = z.object({
  deviseSourceId: z.string().min(1, 'Requis'),
  deviseCibleId: z.string().min(1, 'Requis'),
  taux: z
    .string()
    .trim()
    .min(1, 'Requis')
    .regex(/^\d+(\.\d{1,8})?$/, 'Chiffres, point décimal, 8 décimales au plus')
    .refine((v) => Number(v) > 0, 'Le taux doit être supérieur à zéro'),
  dateValiditeDebut: z.string().trim().optional(),
  motif: z.string().trim().max(200).optional(),
});
type FormValues = z.infer<typeof schema>;

const STATUT_IMPORT: Record<LigneImportTaux['statut'], { label: string; cls: string }> = {
  IMPORTE: { label: 'importé', cls: 'bg-[#ECFDF5] text-[#047857]' },
  INCHANGE: { label: 'inchangé', cls: 'bg-[#F1F5F9] text-[#475569]' },
  PARITE_FIXE: { label: 'parité fixe', cls: 'bg-[#EFF6FF] text-[#1A6DB5]' },
  ECHEC: { label: 'échec', cls: 'bg-[#FEF2F2] text-[#B91C1C]' },
};

function Pastille({ children, cls }: { children: React.ReactNode; cls: string }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${cls}`}>{children}</span>
  );
}

/* -------------------------------------------------------------------------- */

function TauxForm({ onDone }: { onDone: () => void }) {
  const { data: devises } = useDevises();
  const create = useCreateTaux();
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { deviseSourceId: '', deviseCibleId: '', taux: '', dateValiditeDebut: '', motif: '' },
  });

  const srcId = watch('deviseSourceId');
  const cibId = watch('deviseCibleId');
  const src = devises?.find((d) => d.id === srcId);
  const cib = devises?.find((d) => d.id === cibId);
  const taux = watch('taux');

  const onSubmit = handleSubmit((v) => {
    create.mutate(
      {
        deviseSourceId: v.deviseSourceId,
        deviseCibleId: v.deviseCibleId,
        taux: v.taux,
        dateValiditeDebut: v.dateValiditeDebut || undefined,
        motif: v.motif || undefined,
      },
      { onSuccess: onDone },
    );
  });

  return (
    <Panel>
      <PanelHeader title="Nouveau taux" />
      <form onSubmit={onSubmit} className="grid gap-4 p-[18px] sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="deviseSourceId">Devise de départ</Label>
          <select
            id="deviseSourceId"
            {...register('deviseSourceId')}
            className="w-full rounded-[9px] border border-[rgba(15,76,129,0.1)] bg-[#F8FAFC] px-3 py-2 text-xs outline-none focus:border-[#1A6DB5] focus:bg-white"
          >
            <option value="">—</option>
            {devises?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.code} — {d.libelle}
              </option>
            ))}
          </select>
          {errors.deviseSourceId && (
            <p className="text-sm text-destructive">{errors.deviseSourceId.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="deviseCibleId">Devise d’arrivée</Label>
          <select
            id="deviseCibleId"
            {...register('deviseCibleId')}
            className="w-full rounded-[9px] border border-[rgba(15,76,129,0.1)] bg-[#F8FAFC] px-3 py-2 text-xs outline-none focus:border-[#1A6DB5] focus:bg-white"
          >
            <option value="">—</option>
            {devises?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.code} — {d.libelle}
              </option>
            ))}
          </select>
          {errors.deviseCibleId && (
            <p className="text-sm text-destructive">{errors.deviseCibleId.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="taux">Taux</Label>
          <Input id="taux" placeholder="Ex : 655.957" {...register('taux')} />
          {errors.taux ? (
            <p className="text-sm text-destructive">{errors.taux.message}</p>
          ) : (
            <p className="text-[11px] text-[#94A3B8]">
              {src && cib && taux && Number(taux) > 0
                ? `1 ${src.code} = ${taux} ${cib.code}`
                : 'Combien vaut UNE unité de la devise de départ.'}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="dateValiditeDebut">Prend effet le — optionnel</Label>
          <Input id="dateValiditeDebut" type="date" {...register('dateValiditeDebut')} />
          <p className="text-[11px] text-[#94A3B8]">Vide = maintenant. Antidater est permis.</p>
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="motif">Motif — optionnel</Label>
          <Input id="motif" placeholder="Pourquoi ce taux change" {...register('motif')} />
        </div>

        <p className="rounded-[9px] bg-[#F8FAFC] px-3 py-2 text-[11px] text-[#64748B] sm:col-span-2">
          Le taux en vigueur n’est pas modifié : il est <strong>clôturé</strong> à cette date et
          celui-ci prend la suite. L’historique reste intact, et une opération passée reste
          convertible à son taux d’époque. Le sens inverse est déduit automatiquement — inutile de
          le saisir.
        </p>

        <div className="flex items-center gap-2 sm:col-span-2">
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
          <Button type="button" variant="ghost" onClick={onDone}>
            Annuler
          </Button>
          {create.isError && (
            <p className="text-sm text-destructive">
              {apiErrorMessage(create.error, 'Enregistrement impossible')}
            </p>
          )}
        </div>
      </form>
    </Panel>
  );
}

/* -------------------------------------------------------------------------- */

function RapportImport({ rapport, onClose }: { rapport: RapportImportTaux; onClose: () => void }) {
  return (
    <Panel>
      <PanelHeader
        title="Import des taux"
        badge={`${rapport.importes} mis à jour`}
      >
        <button type="button" onClick={onClose} className="ml-auto text-[#64748B] hover:text-[#0F172A]">
          <X className="h-4 w-4" />
        </button>
      </PanelHeader>
      <div className="space-y-2 p-[18px]">
        {rapport.fraicheurApi && (
          <p className="text-[11px] text-[#64748B]">
            Cotation annoncée par la source : <strong>{rapport.fraicheurApi}</strong>
          </p>
        )}
        <table className="w-full text-xs">
          <tbody>
            {rapport.lignes.map((l) => (
              <tr key={l.devise} className="border-t border-[rgba(15,76,129,0.07)]">
                <td className="py-2 pr-3 font-semibold text-[#0F172A]">
                  {l.devise} → {rapport.deviseReference}
                </td>
                <td className="py-2 pr-3">
                  <Pastille cls={STATUT_IMPORT[l.statut].cls}>{STATUT_IMPORT[l.statut].label}</Pastille>
                </td>
                <td className="py-2 pr-3 tabular-nums text-[#0F172A]">{l.taux ?? '—'}</td>
                <td className="py-2 pr-3 tabular-nums text-[#64748B]">
                  {l.variation && l.variation !== '0.00'
                    ? `${Number(l.variation) > 0 ? '+' : ''}${l.variation} %`
                    : ''}
                </td>
                <td className="py-2 text-[#64748B]">{l.detail ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

/* -------------------------------------------------------------------------- */

function LigneHistorique({ taux }: { taux: TauxCourant }) {
  const { data, isLoading } = useHistoriqueTaux(taux.deviseSourceId, taux.deviseCibleId);

  if (isLoading) return <div className="px-4 py-3 text-[11px] text-[#64748B]">Chargement…</div>;
  if (!data?.length) return <div className="px-4 py-3 text-[11px] text-[#64748B]">Aucune période.</div>;

  return (
    <table className="w-full text-[11px]">
      <thead>
        <tr className="text-left text-[10px] uppercase tracking-[0.7px] text-[#94A3B8]">
          <th className="px-4 py-1.5 font-semibold">Taux</th>
          <th className="px-4 py-1.5 font-semibold">Du</th>
          <th className="px-4 py-1.5 font-semibold">Au</th>
          <th className="px-4 py-1.5 font-semibold">Source</th>
          <th className="px-4 py-1.5 font-semibold">Motif</th>
        </tr>
      </thead>
      <tbody>
        {data.map((p) => (
          <tr key={p.id} className="border-t border-[rgba(15,76,129,0.05)]">
            <td className="px-4 py-1.5 tabular-nums font-semibold text-[#0F172A]">{p.taux}</td>
            <td className="px-4 py-1.5 text-[#64748B]">{p.dateValiditeDebut.slice(0, 10)}</td>
            <td className="px-4 py-1.5 text-[#64748B]">
              {p.dateValiditeFin ? p.dateValiditeFin.slice(0, 10) : 'en vigueur'}
            </td>
            <td className="px-4 py-1.5 text-[#64748B]">{p.source}</td>
            <td className="px-4 py-1.5 text-[#94A3B8]">{p.motif ?? ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* -------------------------------------------------------------------------- */

export function TauxChangePage() {
  const user = useAuthStore((s) => s.user);
  const { data: perms } = useMyPermissions(user?.id ?? null);
  const canGerer = new Set(perms ?? []).has('TAUX_GERER');

  const { data: taux, isLoading, isError } = useTauxCourants();
  const { data: reference } = useDeviseReference();
  const importer = useImporterTaux();
  const remove = useDeleteTaux();

  const [showForm, setShowForm] = useState(false);
  const [rapport, setRapport] = useState<RapportImportTaux | null>(null);
  const [deplie, setDeplie] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TauxCourant | null>(null);

  const lancerImport = () =>
    importer.mutate(undefined, { onSuccess: (r) => setRapport(r) });

  return (
    <div className="flex flex-col gap-4">
      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center"
          onClick={() => setShowForm(false)}
        >
          <div className="w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <TauxForm onDone={() => setShowForm(false)} />
          </div>
        </div>
      )}

      {rapport && <RapportImport rapport={rapport} onClose={() => setRapport(null)} />}

      <Panel>
        <PanelHeader title="Taux de change" badge={`${taux?.length ?? 0}`}>
          {reference && (
            <span className="text-[11px] text-[#64748B]">
              Devise de référence : <strong className="text-[#0F172A]">{reference.code}</strong>
            </span>
          )}
          {canGerer && (
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={lancerImport}
                disabled={importer.isPending}
                className="flex items-center gap-1.5 rounded-[9px] border border-[rgba(15,76,129,0.15)] px-3.5 py-1.5 text-[11px] font-medium text-[#0F4C81] transition hover:bg-[#EFF6FF] disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                {importer.isPending ? 'Import en cours…' : 'Importer maintenant'}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(true)}
                className="flex items-center gap-1.5 rounded-[9px] bg-[#0F4C81] px-3.5 py-1.5 text-[11px] font-medium text-white transition hover:bg-[#1A6DB5]"
              >
                <Plus className="h-4 w-4" /> Nouveau taux
              </button>
            </div>
          )}
        </PanelHeader>

        {importer.isError && (
          <div className="border-b border-[rgba(15,76,129,0.07)] bg-[#FEF2F2] px-[18px] py-2.5 text-xs text-[#B91C1C]">
            {apiErrorMessage(importer.error, 'Import impossible')}
          </div>
        )}

        {isLoading && <div className="px-[18px] py-8 text-sm text-[#64748B]">Chargement…</div>}
        {isError && (
          <div className="px-[18px] py-8 text-sm text-[#EF4444]">
            Impossible de charger les taux de change.
          </div>
        )}

        {taux && taux.length === 0 && (
          <div className="px-[18px] py-8 text-sm text-[#64748B]">
            Aucun taux enregistré. Les montants en devises étrangères ne peuvent pas encore être
            consolidés.
          </div>
        )}

        {taux && taux.length > 0 && (
          <table className="w-full text-xs">
            <thead className="bg-[#F8FAFC]">
              <tr className="text-left text-[10px] uppercase tracking-[0.7px] text-[#64748B]">
                <th className="px-4 py-2.5 font-semibold">Couple</th>
                <th className="px-4 py-2.5 font-semibold">Taux</th>
                <th className="px-4 py-2.5 font-semibold">Sens inverse</th>
                <th className="px-4 py-2.5 font-semibold">Source</th>
                <th className="px-4 py-2.5 font-semibold">En vigueur depuis</th>
                <th className="px-4 py-2.5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {taux.map((t) => {
                const ouvert = deplie === t.id;
                return (
                  // La clé va sur le FRAGMENT : c'est lui que `map` renvoie, et
                  // une ligne peut se dédoubler quand l'historique est déplié.
                  <Fragment key={t.id}>
                    <tr className="border-t border-[rgba(15,76,129,0.07)]">
                      <td className="px-4 py-2.5">
                        <button
                          type="button"
                          onClick={() => setDeplie(ouvert ? null : t.id)}
                          className="flex items-center gap-1.5 font-semibold text-[#0F172A] hover:text-[#1A6DB5]"
                        >
                          {ouvert ? (
                            <ChevronDown className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5" />
                          )}
                          {t.deviseSource} → {t.deviseCible}
                        </button>
                      </td>
                      <td className="px-4 py-2.5 tabular-nums font-semibold text-[#0F172A]">
                        {t.taux}
                      </td>
                      <td className="px-4 py-2.5 tabular-nums text-[#64748B]">{t.tauxInverse}</td>
                      <td className="px-4 py-2.5 text-[#64748B]">{t.source}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="text-[#64748B]">
                            {t.dateValiditeDebut.slice(0, 10)} ({ageLabel(t.dateValiditeDebut)})
                          </span>
                          {t.pariteFixe && (
                            <Pastille cls="bg-[#EFF6FF] text-[#1A6DB5]">
                              <Lock className="mr-0.5 inline h-2.5 w-2.5" /> parité fixe
                            </Pastille>
                          )}
                          {t.perime && (
                            <Pastille cls="bg-[#FFFBEB] text-[#92400E]">
                              <AlertTriangle className="mr-0.5 inline h-2.5 w-2.5" /> périmé
                            </Pastille>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {canGerer && (
                          <button
                            type="button"
                            onClick={() => setPendingDelete(t)}
                            title="Retirer ce taux"
                            className="text-[#94A3B8] transition hover:text-[#EF4444]"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                    {ouvert && (
                      <tr className="bg-[#FBFDFF]">
                        <td colSpan={6} className="border-t border-[rgba(15,76,129,0.05)] py-1">
                          <LigneHistorique taux={t} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </Panel>

      <p className="px-1 text-[11px] text-[#94A3B8]">
        Un seul sens est tenu par couple — l’autre est calculé, pour que les deux ne puissent pas
        se contredire. Une <strong>parité fixe</strong> est fixée par accord monétaire : elle
        n’est jamais rapatriée automatiquement, et son ancienneté ne la rend pas douteuse.
      </p>

      <ConfirmDialog
        open={!!pendingDelete}
        title="Retirer ce taux ?"
        description={
          pendingDelete && (
            <>
              Le taux <strong>{pendingDelete.deviseSource} → {pendingDelete.deviseCible}</strong> de{' '}
              <strong>{pendingDelete.taux}</strong> sera retiré, et le taux précédent redeviendra
              celui en vigueur. Rien n’est effacé de l’historique.
            </>
          )
        }
        confirmLabel="Retirer"
        variant="danger"
        icon={Trash2}
        busy={remove.isPending}
        error={remove.isError ? apiErrorMessage(remove.error, 'Suppression impossible') : undefined}
        onConfirm={() =>
          pendingDelete &&
          remove.mutate(pendingDelete.id, {
            onSuccess: () => {
              setPendingDelete(null);
              remove.reset();
            },
          })
        }
        onCancel={() => {
          setPendingDelete(null);
          remove.reset();
        }}
      />
    </div>
  );
}
