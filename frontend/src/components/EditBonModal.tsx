import { useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AxiosError } from 'axios';
import { X } from 'lucide-react';
import { useEditBon, useEditSousBon } from '@/api/bons';
import { usePartenaires } from '@/api/referentiel';
import type { Bon, SousBon } from '@/types/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const montantRegex = /^\d+(\.\d{1,4})?$/;

const sousBonSchema = z.object({
  id: z.string(),
  numeroSousBon: z.number(),
  libelle: z.string().min(1, 'Requis'),
  montant: z
    .string()
    .regex(montantRegex, 'Montant invalide')
    .refine((v) => parseFloat(v) > 0, 'Doit être > 0'),
  description: z.string().optional(),
  partenaireId: z.string().optional(),
  numeroBl: z.string().min(1, 'Requis'),
  codeManutention: z.string().min(1, 'Requis'),
  numeroClient: z.string().optional(),
});

const schema = z.object({
  porteur: z.string().optional(),
  soubons: z.array(sousBonSchema),
});

type FormValues = z.infer<typeof schema>;

function axiosMessage(error: unknown, fallback: string): string {
  if (error instanceof AxiosError) {
    return (error.response?.data as { message?: string })?.message ?? fallback;
  }
  return fallback;
}

/**
 * Édition d'un bon au statut CREE et de ses sous-bons.
 * Réservé (côté serveur) aux VALIDATEUR / titulaires de BON_MODIFIER_SPEC (admins inclus).
 * Les axes d'imputation (caisse/portefeuille/cost-center/nature/devise) ne sont pas éditables.
 */
export function EditBonModal({
  bon,
  soubons,
  onClose,
}: {
  bon: Bon;
  soubons: SousBon[];
  onClose: () => void;
}) {
  const { data: partenaires } = usePartenaires();
  const editBon = useEditBon(bon.id);
  const editSousBon = useEditSousBon(bon.id);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      porteur: bon.porteur ?? '',
      soubons: soubons.map((sb) => ({
        id: String(sb.id),
        numeroSousBon: sb.numeroSousBon,
        libelle: sb.libelle,
        montant: sb.montant,
        description: sb.description ?? '',
        partenaireId: sb.partenaireId ? String(sb.partenaireId) : '',
        numeroBl: sb.numeroBl,
        codeManutention: sb.codeManutention,
        numeroClient: sb.numeroClient ?? '',
      })),
    },
  });
  const { fields } = useFieldArray({ control, name: 'soubons' });

  const pending = isSubmitting || editBon.isPending || editSousBon.isPending;

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      // 1) Enveloppe (porteur). Chaîne vide => le serveur efface.
      await editBon.mutateAsync({ porteur: values.porteur?.trim() ?? '' });

      // 2) Chaque sous-bon. Séquentiel pour que le recalcul de montantTotal soit cohérent
      //    et pour pouvoir pointer le sous-bon fautif en cas d'erreur.
      for (const sb of values.soubons) {
        await editSousBon.mutateAsync({
          sousBonId: sb.id,
          payload: {
            libelle: sb.libelle.trim(),
            montant: sb.montant,
            description: sb.description?.trim() ?? '',
            partenaireId: sb.partenaireId ? sb.partenaireId : null,
            numeroBl: sb.numeroBl.trim(),
            codeManutention: sb.codeManutention.trim(),
            numeroClient: sb.numeroClient?.trim() ? sb.numeroClient.trim() : null,
          },
        });
      }
      onClose();
    } catch (e) {
      setSubmitError(axiosMessage(e, 'Enregistrement impossible.'));
    }
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-[13px] border border-[rgba(15,76,129,0.1)] bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-[rgba(15,76,129,0.07)] px-5 py-3">
          <div className="font-display text-sm font-semibold text-[#0F172A]">
            Modifier le bon {bon.numero}
          </div>
          <button
            type="button"
            aria-label="Fermer"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-[7px] text-[#94A3B8] hover:bg-[#F8FAFC] hover:text-[#0F172A]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
            {/* Enveloppe */}
            <div className="space-y-2">
              <Label htmlFor="edit-porteur">
                Porteur — personne qui se présentera à la caisse{' '}
                <span className="text-muted-foreground">(optionnel)</span>
              </Label>
              <Input
                id="edit-porteur"
                {...register('porteur')}
                placeholder="Nom de la personne qui ira retirer à la caisse…"
              />
            </div>

            {/* Sous-bons */}
            <div className="space-y-4">
              {fields.map((field, i) => (
                <div key={field.id} className="space-y-3 rounded-md border border-[rgba(15,76,129,0.1)] p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Sous-bon n° {field.numeroSousBon}
                  </div>
                  <input type="hidden" {...register(`soubons.${i}.id`)} />

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label htmlFor={`sb-${i}-libelle`}>Libellé</Label>
                      <Input id={`sb-${i}-libelle`} {...register(`soubons.${i}.libelle`)} />
                      {errors.soubons?.[i]?.libelle && (
                        <p className="text-xs text-destructive">{errors.soubons[i]?.libelle?.message}</p>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor={`sb-${i}-montant`}>Montant</Label>
                      <Input id={`sb-${i}-montant`} inputMode="decimal" {...register(`soubons.${i}.montant`)} />
                      {errors.soubons?.[i]?.montant && (
                        <p className="text-xs text-destructive">{errors.soubons[i]?.montant?.message}</p>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor={`sb-${i}-partenaire`}>
                        Partenaire <span className="text-muted-foreground">(optionnel)</span>
                      </Label>
                      <select
                        id={`sb-${i}-partenaire`}
                        {...register(`soubons.${i}.partenaireId`)}
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      >
                        <option value="">— Aucun —</option>
                        {(partenaires ?? []).map((p) => (
                          <option key={p.id} value={String(p.id)}>
                            {p.code} — {p.raisonSociale}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor={`sb-${i}-bl`}>N° BL</Label>
                      <Input id={`sb-${i}-bl`} {...register(`soubons.${i}.numeroBl`)} />
                      {errors.soubons?.[i]?.numeroBl && (
                        <p className="text-xs text-destructive">{errors.soubons[i]?.numeroBl?.message}</p>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor={`sb-${i}-manut`}>Code manutention</Label>
                      <Input id={`sb-${i}-manut`} {...register(`soubons.${i}.codeManutention`)} />
                      {errors.soubons?.[i]?.codeManutention && (
                        <p className="text-xs text-destructive">{errors.soubons[i]?.codeManutention?.message}</p>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor={`sb-${i}-client`}>
                        N° client <span className="text-muted-foreground">(optionnel)</span>
                      </Label>
                      <Input id={`sb-${i}-client`} {...register(`soubons.${i}.numeroClient`)} />
                    </div>

                    <div className="space-y-1.5 sm:col-span-2">
                      <Label htmlFor={`sb-${i}-desc`}>
                        Description <span className="text-muted-foreground">(optionnel)</span>
                      </Label>
                      <Input id={`sb-${i}-desc`} {...register(`soubons.${i}.description`)} />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {submitError && <p className="text-sm text-destructive">{submitError}</p>}
          </div>

          <div className="flex justify-end gap-2 border-t border-[rgba(15,76,129,0.07)] px-5 py-3">
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              Annuler
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
