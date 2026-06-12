import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Loader2,
  Save,
  Settings2,
  User as UserIcon,
  X,
} from 'lucide-react';
import {
  useBonCaisseBySousBon,
  useCancelPrepareBonCaisse,
  useFinalizeBonCaisse,
  usePrepareBonCaisse,
  useUpdateBonCaisse,
} from '@/api/bonsCaisse';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiErrorMessage, cn, formatMontant } from '@/lib/utils';
import type { BonCaisse, SousBon } from '@/types/api';

const baseSchema = z.object({
  beneficiaire: z.string().trim().max(255, 'Maximum 255 caractères').optional(),
  libelleAjuste: z.string().trim().max(255, 'Maximum 255 caractères').optional(),
  montantAjuste: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || /^\d+(\.\d{1,4})?$/.test(v), 'Montant invalide'),
  commentaire: z.string().trim().max(500, 'Maximum 500 caractères').optional(),
});

type FormValues = z.infer<typeof baseSchema>;

interface Props {
  bonId: string;
  sousBonOriginal: SousBon;
  /**
   * Nom du porteur déclaré sur le bon (saisi par le demandeur ou le validateur).
   * Sert à pré-remplir le champ bénéficiaire. Le caissier peut le modifier si
   * la personne qui se présente n'est pas celle déclarée.
   */
  defaultBeneficiaire?: string | null;
  onClose: () => void;
  onDone?: (bonCaisse: BonCaisse) => void;
}

/**
 * Modal de préparation du décaissement (workflow BonCaisse).
 *
 * UX : Le caissier saisit en priorité le bénéficiaire. Les ajustements
 * (montant, libellé, commentaire) sont repliés derrière un disclosure
 * « Ajuster avant décaissement » et n'apparaissent qu'à la demande.
 */
export function PreparationDecaissementModal({
  bonId,
  sousBonOriginal,
  defaultBeneficiaire,
  onClose,
  onDone,
}: Props) {
  const sousBonId = sousBonOriginal.id;

  const existingQuery = useBonCaisseBySousBon(sousBonId);
  const prepare = usePrepareBonCaisse();
  const update = useUpdateBonCaisse();
  const finalize = useFinalizeBonCaisse();
  const cancel = useCancelPrepareBonCaisse();

  const [bonCaisse, setBonCaisse] = useState<BonCaisse | null>(null);
  const [prepareError, setPrepareError] = useState<string | null>(null);
  const [showAdjustments, setShowAdjustments] = useState(false);

  // 1) PREPARE existant ou création
  useEffect(() => {
    if (bonCaisse) return;
    if (existingQuery.isLoading) return;
    const existing = (existingQuery.data ?? []).find((bc) => bc.statut === 'PREPARE');
    if (existing) {
      setBonCaisse(existing);
      return;
    }
    if (prepare.isPending) return;
    setPrepareError(null);
    prepare.mutate(
      { bonId, sousBonId },
      {
        onSuccess: (bc) => setBonCaisse(bc),
        onError: (err) =>
          setPrepareError(apiErrorMessage(err, 'Impossible de préparer le décaissement')),
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingQuery.isLoading, existingQuery.data]);

  const form = useForm<FormValues>({
    resolver: zodResolver(baseSchema),
    defaultValues: {
      beneficiaire: '',
      libelleAjuste: '',
      montantAjuste: '',
      commentaire: '',
    },
  });

  // Hydrate avec les valeurs du BonCaisse (si reprise d'un brouillon).
  // Le bénéficiaire est pré-rempli avec le porteur déclaré sur le bon : le
  // caissier confirme la personne qui se présente (et la modifie seulement
  // si quelqu'un d'autre vient récupérer les fonds).
  useEffect(() => {
    if (!bonCaisse) return;
    form.reset({
      beneficiaire:
        bonCaisse.beneficiaire ?? defaultBeneficiaire?.trim() ?? '',
      libelleAjuste: bonCaisse.libelleAjuste ?? '',
      montantAjuste: bonCaisse.montantAjuste ?? '',
      commentaire: bonCaisse.commentaire ?? '',
    });
    if (
      bonCaisse.libelleAjuste ||
      bonCaisse.montantAjuste ||
      bonCaisse.commentaire
    ) {
      setShowAdjustments(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bonCaisse?.id, defaultBeneficiaire]);

  const beneficiaireValue = form.watch('beneficiaire')?.trim() ?? '';
  const canFinalize = !!bonCaisse && bonCaisse.statut === 'PREPARE' && beneficiaireValue.length > 0;

  // Détecter les ajustements en cours (pour le badge)
  const hasAdjustments = useMemo(() => {
    const v = form.watch();
    return !!(v.libelleAjuste || v.montantAjuste || v.commentaire);
  }, [form.watch()]);

  function buildPayload(values: FormValues) {
    return {
      beneficiaire: values.beneficiaire?.trim() || undefined,
      libelleAjuste: values.libelleAjuste?.trim() || undefined,
      montantAjuste: values.montantAjuste?.trim() || undefined,
      commentaire: values.commentaire?.trim() || undefined,
    };
  }

  const handleSaveDraft = form.handleSubmit((values) => {
    if (!bonCaisse) return;
    update.mutate({ id: bonCaisse.id, payload: buildPayload(values) });
  });

  const handleFinalize = form.handleSubmit((values) => {
    if (!bonCaisse) return;
    update.mutate(
      { id: bonCaisse.id, payload: buildPayload(values) },
      {
        onSuccess: () => {
          finalize.mutate(bonCaisse.id, {
            onSuccess: (bc) => {
              onDone?.(bc);
              onClose();
            },
          });
        },
      },
    );
  });

  const handleCancelPrepare = () => {
    if (!bonCaisse) {
      onClose();
      return;
    }
    cancel.mutate(bonCaisse.id, { onSuccess: () => onClose() });
  };

  const errorMessage =
    prepareError ??
    (existingQuery.isError ? apiErrorMessage(existingQuery.error, 'Erreur lors du chargement') : null) ??
    (prepare.error ? apiErrorMessage(prepare.error, 'Erreur lors de la préparation') : null) ??
    (update.error ? apiErrorMessage(update.error, 'Erreur lors de la mise à jour') : null) ??
    (finalize.error ? apiErrorMessage(finalize.error, 'Erreur lors de la finalisation') : null) ??
    (cancel.error ? apiErrorMessage(cancel.error, "Erreur lors de l'annulation") : null);

  const isLoadingPrepare = !bonCaisse && (existingQuery.isLoading || prepare.isPending);
  const isMutating = update.isPending || finalize.isPending || cancel.isPending;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="preparation-decaissement-title"
    >
      <div className="w-full max-w-lg overflow-hidden rounded-[13px] border border-[rgba(15,76,129,0.1)] bg-white shadow-xl">
        {/* Header compact */}
        <div className="flex items-center justify-between gap-3 border-b border-[rgba(15,76,129,0.07)] bg-[#F8FAFC] px-5 py-3">
          <div className="min-w-0">
            <div
              id="preparation-decaissement-title"
              className="font-display text-sm font-semibold text-[#0F172A]"
            >
              Décaissement — {sousBonOriginal.libelle}
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-[#64748B]">
              <span>Sous-bon #{sousBonOriginal.numeroSousBon}</span>
              <span>·</span>
              <span className="font-semibold tabular-nums text-[#0F172A]">
                {formatMontant(sousBonOriginal.montant)}
              </span>
            </div>
          </div>
          <button
            type="button"
            aria-label="Fermer"
            onClick={onClose}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] text-[#94A3B8] hover:bg-white hover:text-[#0F172A]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Corps */}
        <div className="max-h-[70vh] overflow-y-auto p-5">
          {isLoadingPrepare && (
            <div className="flex items-center gap-2 rounded-[10px] border border-dashed border-[rgba(15,76,129,0.2)] bg-white p-4 text-sm text-[#64748B]">
              <Loader2 className="h-4 w-4 animate-spin text-[#0F4C81]" />
              Préparation en cours…
            </div>
          )}

          {bonCaisse && (
            <form className="space-y-4">
              {/* BÉNÉFICIAIRE — focus principal */}
              <div>
                <Label htmlFor="bc-beneficiaire" className="flex items-center gap-1.5 text-sm font-medium">
                  <UserIcon className="h-3.5 w-3.5 text-[#1A6DB5]" />
                  Personne qui se présente <span className="text-[#B42318]">*</span>
                </Label>
                <Input
                  id="bc-beneficiaire"
                  placeholder="Nom du bénéficiaire"
                  disabled={bonCaisse.statut !== 'PREPARE' || isMutating}
                  {...form.register('beneficiaire')}
                />
                {form.formState.errors.beneficiaire && (
                  <p className="mt-1 text-xs text-[#B42318]">
                    {form.formState.errors.beneficiaire.message}
                  </p>
                )}
                {defaultBeneficiaire ? (
                  <p className="mt-1 text-[10px] text-[#64748B]">
                    Porteur déclaré sur le bon :{' '}
                    <strong className="text-[#0F172A]">{defaultBeneficiaire}</strong>. Modifiez seulement si une autre personne se présente.
                  </p>
                ) : (
                  <p className="mt-1 text-[10px] text-[#92400E]">
                    Aucun porteur n'a été déclaré sur ce bon — saisissez le nom de la personne qui se présente.
                  </p>
                )}
              </div>

              {/* AJUSTEMENTS — repliés par défaut */}
              <div className="rounded-[10px] border border-[rgba(15,76,129,0.08)]">
                <button
                  type="button"
                  onClick={() => setShowAdjustments((v) => !v)}
                  disabled={bonCaisse.statut !== 'PREPARE' || isMutating}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-xs font-medium text-[#475569] hover:bg-[#F8FAFC] disabled:opacity-50"
                >
                  <Settings2 className="h-3.5 w-3.5 text-[#94A3B8]" />
                  Ajuster le montant ou le libellé
                  <span className="text-[10px] font-normal text-[#94A3B8]">(optionnel)</span>
                  {hasAdjustments && (
                    <span className="rounded-full bg-[#FFFBEB] px-1.5 py-0.5 text-[9px] font-semibold text-[#92400E]">
                      Modifié
                    </span>
                  )}
                  <ChevronDown
                    className={cn(
                      'ml-auto h-4 w-4 text-[#94A3B8] transition-transform',
                      showAdjustments && 'rotate-180',
                    )}
                  />
                </button>

                {showAdjustments && (
                  <div className="space-y-3 border-t border-[rgba(15,76,129,0.08)] bg-[#FAFBFC] px-3 py-3">
                    <div>
                      <Label htmlFor="bc-montant" className="text-xs">
                        Montant ajusté
                      </Label>
                      <Input
                        id="bc-montant"
                        inputMode="decimal"
                        placeholder={`Conserver ${formatMontant(sousBonOriginal.montant)}`}
                        disabled={bonCaisse.statut !== 'PREPARE' || isMutating}
                        {...form.register('montantAjuste')}
                      />
                      {form.formState.errors.montantAjuste && (
                        <p className="mt-1 text-xs text-[#B42318]">
                          {form.formState.errors.montantAjuste.message}
                        </p>
                      )}
                    </div>

                    <div>
                      <Label htmlFor="bc-libelle" className="text-xs">
                        Libellé ajusté
                      </Label>
                      <Input
                        id="bc-libelle"
                        placeholder={`Conserver « ${sousBonOriginal.libelle} »`}
                        disabled={bonCaisse.statut !== 'PREPARE' || isMutating}
                        {...form.register('libelleAjuste')}
                      />
                    </div>

                    <div>
                      <Label htmlFor="bc-commentaire" className="text-xs">
                        Commentaire
                      </Label>
                      <Input
                        id="bc-commentaire"
                        placeholder="Précisions, contrôles effectués…"
                        disabled={bonCaisse.statut !== 'PREPARE' || isMutating}
                        {...form.register('commentaire')}
                      />
                    </div>
                  </div>
                )}
              </div>
            </form>
          )}

          {errorMessage && (
            <div className="mt-4 flex items-start gap-2 rounded-[8px] bg-[#FEF3F2] px-3 py-2 text-xs text-[#B42318]">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 border-t border-[rgba(15,76,129,0.07)] bg-[#FAFBFC] px-5 py-3">
          <button
            type="button"
            onClick={handleCancelPrepare}
            disabled={isMutating}
            className="text-[11px] font-medium text-[#B42318] hover:underline disabled:opacity-50"
          >
            {cancel.isPending ? 'Annulation…' : 'Annuler la préparation'}
          </button>
          <div className="flex-1" />
          <Button
            type="button"
            variant="ghost"
            onClick={handleSaveDraft}
            disabled={!bonCaisse || bonCaisse.statut !== 'PREPARE' || isMutating}
            className="text-[#475569]"
          >
            <Save className="h-3.5 w-3.5" />
            {update.isPending && !finalize.isPending ? 'Enregistrement…' : 'Brouillon'}
          </Button>
          <Button
            type="button"
            onClick={handleFinalize}
            disabled={!canFinalize || isMutating}
            className="bg-[#00C896] text-white hover:bg-[#047857]"
          >
            <CheckCircle2 className="h-4 w-4" />
            {finalize.isPending ? 'Finalisation…' : 'Confirmer le décaissement'}
          </Button>
        </div>
      </div>
    </div>
  );
}
