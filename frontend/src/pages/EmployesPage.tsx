import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  CreditCard,
  Download,
  FileDown,
  Gift,
  Landmark,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  Wallet,
  X,
  XCircle,
} from 'lucide-react';
import {
  useEmployes,
  useCreateEmploye,
  useUpdateEmploye,
  useDeleteEmploye,
  useImportEmployes,
  useApercuImportEmployes,
  exportEmployes,
  telechargerModeleEmployes,
  useBenefices,
  useCreateBenefice,
  useUpdateBenefice,
} from '@/api/employes';
import type { ApercuImport, ApercuLigne } from '@/api/employes';
import { useTypesBenefice } from '@/api/employes';
import { useCredits } from '@/api/credits';
import { useDirections } from '@/api/directions';
import { usePortefeuilles } from '@/api/financierRef';
import { apiErrorMessage, cn, formatMontant } from '@/lib/utils';
import type { CreateEmployeBeneficePayload, Employe, EmployeBenefice, TypeBenefice } from '@/types/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { SortableHeader } from '@/components/SortableHeader';
import { useTableSort } from '@/hooks/useTableSort';

const EMP_SORT_COLUMNS = ['matricule', 'nom', 'prenoms', 'salaire'] as const;
type EmpSortCol = (typeof EMP_SORT_COLUMNS)[number];

/** Style + libellé par statut de ligne d'aperçu d'import. */
const STATUT_META: Record<ApercuLigne['statut'], { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
  OK: { label: 'À créer', cls: 'bg-[#ECFDF5] text-[#047857]', Icon: CheckCircle2 },
  IGNORE: { label: 'Ignoré', cls: 'bg-[#FFFBEB] text-[#B45309]', Icon: AlertTriangle },
  ERREUR: { label: 'Erreur', cls: 'bg-[#FEF3F2] text-[#B42318]', Icon: XCircle },
};

const schema = z.object({
  matricule: z.string().trim().min(1, 'Requis'),
  nom: z.string().trim().min(1, 'Requis'),
  prenoms: z.string().trim().min(1, 'Requis'),
  directionId: z.string().optional(),
  salaire: z.string().optional(),
  modeReglement: z.enum(['ESPECES', 'VIREMENT']),
  banque: z.string().optional(),
  rib: z.string().optional(),
  portefeuilleSourceId: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

function EmployeForm({ employe, onDone }: { employe?: Employe; onDone: () => void }) {
  const isEdit = !!employe;
  const create = useCreateEmploye();
  const update = useUpdateEmploye();
  const { data: directions } = useDirections();
  const { data: portefeuilles } = usePortefeuilles();
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: employe
      ? {
          matricule: employe.matricule,
          nom: employe.nom,
          prenoms: employe.prenoms,
          directionId: employe.directionId ?? '',
          salaire: employe.salaire ?? '',
          modeReglement: employe.modeReglement ?? 'ESPECES',
          banque: employe.banque ?? '',
          rib: employe.rib ?? '',
          portefeuilleSourceId: employe.portefeuilleSourceId ?? '',
        }
      : {
          matricule: '',
          nom: '',
          prenoms: '',
          directionId: '',
          salaire: '',
          modeReglement: 'ESPECES',
          banque: '',
          rib: '',
          portefeuilleSourceId: '',
        },
  });
  const modeReglement = watch('modeReglement');

  const pending = create.isPending || update.isPending;
  const mutError = create.error || update.error;
  const hasError = create.isError || update.isError;

  const onSubmit = handleSubmit((values) => {
    const done = () => {
      reset();
      onDone();
    };
    // Champs de paiement communs aux deux modes. En espèces, on neutralise
    // banque/RIB pour ne pas garder de coordonnées orphelines.
    const paiement = {
      modeReglement: values.modeReglement,
      banque: values.modeReglement === 'VIREMENT' ? values.banque || null : null,
      rib: values.modeReglement === 'VIREMENT' ? values.rib || null : null,
      portefeuilleSourceId: values.portefeuilleSourceId || null,
    };
    if (isEdit) {
      update.mutate(
        {
          id: employe!.id,
          payload: {
            nom: values.nom,
            prenoms: values.prenoms,
            directionId: values.directionId || undefined,
            salaire: values.salaire || undefined,
            ...paiement,
          },
        },
        { onSuccess: done },
      );
    } else {
      create.mutate(
        {
          matricule: values.matricule,
          nom: values.nom,
          prenoms: values.prenoms,
          directionId: values.directionId || undefined,
          salaire: values.salaire || undefined,
          ...paiement,
        },
        { onSuccess: done },
      );
    }
  });

  return (
    <Panel>
      <PanelHeader title={isEdit ? `Modifier ${employe!.nom} ${employe!.prenoms}` : 'Nouvel employé'} />
      <form onSubmit={onSubmit} className="grid gap-4 p-[18px] sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="matricule">Matricule</Label>
          <Input id="matricule" placeholder="Ex : NPG0042" disabled={isEdit} {...register('matricule')} />
          {errors.matricule && <p className="text-sm text-destructive">{errors.matricule.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nom">Nom</Label>
          <Input id="nom" placeholder="Nom de famille" {...register('nom')} />
          {errors.nom && <p className="text-sm text-destructive">{errors.nom.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="prenoms">Prénoms</Label>
          <Input id="prenoms" placeholder="Prénom(s)" {...register('prenoms')} />
          {errors.prenoms && <p className="text-sm text-destructive">{errors.prenoms.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="directionId">Direction</Label>
          <select
            id="directionId"
            className="flex h-9 w-full rounded-[9px] border border-[rgba(15,76,129,0.1)] bg-[#F8FAFC] px-3 text-xs text-[#0F172A] outline-none focus:border-[#1A6DB5] focus:bg-white"
            {...register('directionId')}
          >
            <option value="">— Aucune —</option>
            {(directions ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.code} — {d.libelle}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="salaire">Salaire</Label>
          <Input id="salaire" type="number" min="0" step="1" placeholder="Ex : 350000" {...register('salaire')} />
          <p className="text-[10px] text-[#94A3B8]">Visible selon habilitation.</p>
        </div>

        {/* ------------------------------------------------------- Paiement -- */}
        <div className="sm:col-span-2 rounded-[9px] border border-[rgba(15,76,129,0.1)] bg-[#FBFCFE] p-3.5">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.6px] text-[#64748B]">Paiement</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="modeReglement">Mode de règlement</Label>
              <select
                id="modeReglement"
                className="flex h-9 w-full rounded-[9px] border border-[rgba(15,76,129,0.1)] bg-white px-3 text-xs text-[#0F172A] outline-none focus:border-[#1A6DB5]"
                {...register('modeReglement')}
              >
                <option value="ESPECES">Espèces</option>
                <option value="VIREMENT">Virement bancaire</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="portefeuilleSourceId">Portefeuille source par défaut</Label>
              <select
                id="portefeuilleSourceId"
                className="flex h-9 w-full rounded-[9px] border border-[rgba(15,76,129,0.1)] bg-white px-3 text-xs text-[#0F172A] outline-none focus:border-[#1A6DB5]"
                {...register('portefeuilleSourceId')}
              >
                <option value="">— Aucun —</option>
                {(portefeuilles ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} — {p.libelle}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-[#94A3B8]">Enveloppe d’où sortent ses avances / crédits.</p>
            </div>

            {modeReglement === 'VIREMENT' && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="banque">Banque</Label>
                  <Input id="banque" placeholder="Ex : SGBCI" {...register('banque')} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rib">RIB / n° de compte</Label>
                  <Input id="rib" placeholder="Ex : CI05 5…" {...register('rib')} />
                </div>
              </>
            )}
          </div>
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

/* -------------------------------------------- Modale Bénéfices d'un employé -- */

// Le montant et les dates sont conditionnels au type choisi (validés à la volée
// dans onSubmit + côté serveur), d'où un schéma volontairement permissif.
const beneficeSchema = z.object({
  typeBeneficeId: z.string().trim().min(1, 'Requis'),
  montant: z.string().trim().optional(),
  dateDebut: z.string().trim().optional(),
  dateFin: z.string().trim().optional(),
  commentaire: z.string().optional(),
});
type BeneficeFormValues = z.infer<typeof beneficeSchema>;

/** Décrit en une ligne comment ce type s'attribue (aide sous le sélecteur). */
function describeMode(t: TypeBenefice): string {
  if (t.modeMontant === 'FIXE') return `Montant fixe : ${formatMontant(t.montantFixe ?? '0')}`;
  if (t.modeMontant === 'POURCENTAGE_SALAIRE') return `Montant = ${t.pourcentageSalaire ?? '?'} % du salaire`;
  return 'Montant saisi librement';
}

function BeneficesModal({ employe, onClose }: { employe: Employe; onClose: () => void }) {
  const { data: benefices, isLoading } = useBenefices(employe.id);
  const { data: types } = useTypesBenefice();
  const create = useCreateBenefice(employe.id);
  const update = useUpdateBenefice(employe.id);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<BeneficeFormValues>({ resolver: zodResolver(beneficeSchema) });
  const [formError, setFormError] = useState<string | null>(null);

  const typeLabel = (id: string) => types?.find((t) => t.id === id)?.libelle ?? id;

  // Type sélectionné → pilote l'affichage (montant éditable ou calculé, période…).
  const selectedType = types?.find((t) => t.id === watch('typeBeneficeId')) ?? null;
  const salaireNum = employe.salaire != null ? Number(employe.salaire) : null;
  const montantSaisi = !selectedType || selectedType.modeMontant === 'SAISI';
  const afficherPeriode = !selectedType || selectedType.requiertPeriode;

  // Aperçu du montant imposé/calculé (modes FIXE / % du salaire).
  const montantAuto =
    selectedType?.modeMontant === 'FIXE'
      ? (selectedType.montantFixe ?? null)
      : selectedType?.modeMontant === 'POURCENTAGE_SALAIRE' && salaireNum != null && selectedType.pourcentageSalaire != null
        ? ((salaireNum * Number(selectedType.pourcentageSalaire)) / 100).toFixed(0)
        : null;

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    if (!selectedType) {
      setFormError('Choisissez un type de bénéfice.');
      return;
    }
    if (selectedType.modeMontant === 'SAISI' && (!values.montant || Number(values.montant) <= 0)) {
      setFormError('Le montant est requis pour ce type.');
      return;
    }
    if (selectedType.modeMontant === 'POURCENTAGE_SALAIRE' && salaireNum == null) {
      setFormError("Le salaire de l'employé n'est pas connu : montant impossible à calculer.");
      return;
    }
    if (selectedType.requiertPeriode) {
      if (!values.dateDebut || !values.dateFin) {
        setFormError('Les dates de début et de fin sont requises.');
        return;
      }
      if (values.dateFin < values.dateDebut) {
        setFormError('La date de fin doit suivre la date de début.');
        return;
      }
    }

    // Construit la charge utile : montant seulement en mode SAISI (sinon le
    // serveur l'impose/calcule), dates seulement si le type a une période.
    const payload: CreateEmployeBeneficePayload = {
      typeBeneficeId: values.typeBeneficeId,
      commentaire: values.commentaire || undefined,
    };
    if (selectedType.modeMontant === 'SAISI') payload.montant = values.montant;
    if (selectedType.requiertPeriode) {
      payload.dateDebut = values.dateDebut;
      payload.dateFin = values.dateFin;
    }
    create.mutate(payload, {
      onSuccess: () => {
        reset({ typeBeneficeId: '', montant: '', dateDebut: '', dateFin: '', commentaire: '' });
        setFormError(null);
      },
    });
  });

  const toggleValide = (b: EmployeBenefice) => {
    update.mutate({ id: b.id, payload: { estValide: !b.estValide } });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-[13px] border border-[rgba(15,76,129,0.1)] bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[rgba(15,76,129,0.07)] bg-[#F8FAFC] px-5 py-3">
          <div className="flex items-center gap-2 font-display text-sm font-semibold text-[#0F172A]">
            <Gift className="h-4 w-4 text-[#0F4C81]" />
            Bénéfices — {employe.nom} {employe.prenoms}
          </div>
          <button
            type="button"
            aria-label="Fermer"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-[7px] text-[#94A3B8] hover:bg-white hover:text-[#0F172A]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* Formulaire d'ajout */}
          <form onSubmit={onSubmit} className="grid gap-3 rounded-[11px] border border-[rgba(15,76,129,0.1)] bg-[#FBFCFE] p-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="typeBeneficeId">Type de bénéfice</Label>
              <select
                id="typeBeneficeId"
                className="flex h-9 w-full rounded-[9px] border border-[rgba(15,76,129,0.1)] bg-white px-3 text-xs text-[#0F172A] outline-none focus:border-[#1A6DB5]"
                {...register('typeBeneficeId')}
              >
                <option value="">— Choisir —</option>
                {(types ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.libelle}
                  </option>
                ))}
              </select>
              {errors.typeBeneficeId && <p className="text-sm text-destructive">{errors.typeBeneficeId.message}</p>}
              {selectedType && (
                <p className="text-[11px] text-[#64748B]">
                  {describeMode(selectedType)}
                  {selectedType.plafondPourcentageSalaire ? ` · plafond ${selectedType.plafondPourcentageSalaire} % du salaire` : ''}
                  {selectedType.jourMinMois ? ` · dès le ${selectedType.jourMinMois} du mois` : ''}
                </p>
              )}
            </div>

            {/* Montant : éditable (SAISI) ou imposé/calculé (FIXE / % du salaire) */}
            <div className="space-y-1.5">
              <Label htmlFor="montant">Montant</Label>
              {montantSaisi ? (
                <Input id="montant" type="number" min="0" step="1" placeholder="Ex : 500000" {...register('montant')} />
              ) : (
                <div className="flex h-9 items-center rounded-[9px] border border-dashed border-[rgba(15,76,129,0.2)] bg-[#F1F5F9] px-3 text-xs text-[#334155]">
                  {montantAuto != null ? (
                    <span className="font-semibold">{formatMontant(montantAuto)}</span>
                  ) : selectedType?.modeMontant === 'POURCENTAGE_SALAIRE' ? (
                    <span className="text-[#B45309]">Salaire inconnu — impossible de calculer</span>
                  ) : (
                    <span className="text-[#94A3B8]">Déterminé automatiquement</span>
                  )}
                </div>
              )}
              {!montantSaisi && (
                <p className="text-[11px] text-[#94A3B8]">
                  {selectedType?.modeMontant === 'FIXE' ? 'Montant imposé par le type.' : 'Calculé à partir du salaire.'}
                </p>
              )}
            </div>

            {/* Période : seulement si le type en requiert une */}
            {afficherPeriode && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="dateDebut">Début de validité</Label>
                  <Input id="dateDebut" type="date" {...register('dateDebut')} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="dateFin">Fin de validité</Label>
                  <Input id="dateFin" type="date" {...register('dateFin')} />
                </div>
              </>
            )}
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="commentaire">Commentaire (optionnel)</Label>
              <Input id="commentaire" {...register('commentaire')} />
            </div>
            <div className="flex items-center gap-2 sm:col-span-2">
              <Button type="submit" disabled={create.isPending}>
                <Plus className="mr-1 h-4 w-4" />
                {create.isPending ? 'Ajout…' : 'Accorder le bénéfice'}
              </Button>
              {(formError || create.isError) && (
                <p className="text-sm text-destructive">
                  {formError ?? apiErrorMessage(create.error, 'Ajout impossible')}
                </p>
              )}
            </div>
          </form>

          {/* Liste des bénéfices */}
          <div className="mt-4">
            {isLoading && <div className="py-6 text-sm text-[#64748B]">Chargement…</div>}
            {benefices && benefices.length === 0 && (
              <div className="py-6 text-center text-sm text-[#64748B]">Aucun bénéfice pour cet employé.</div>
            )}
            {benefices && benefices.length > 0 && (
              <table className="w-full text-xs">
                <thead className="bg-[#F8FAFC]">
                  <tr className="text-left text-[10px] uppercase tracking-[0.7px] text-[#64748B]">
                    <th className="px-3 py-2.5 font-semibold">Type</th>
                    <th className="px-3 py-2.5 font-semibold">Montant</th>
                    <th className="px-3 py-2.5 font-semibold">Période</th>
                    <th className="px-3 py-2.5 font-semibold">État</th>
                    <th className="px-3 py-2.5">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {benefices.map((b) => (
                    <tr key={b.id} className="border-t border-[rgba(15,76,129,0.07)]">
                      <td className="px-3 py-2.5 font-medium">{typeLabel(b.typeBeneficeId)}</td>
                      <td className="px-3 py-2.5">{formatMontant(b.montant)}</td>
                      <td className="px-3 py-2.5 text-[#64748B]">
                        {b.dateDebut} → {b.dateFin}
                      </td>
                      <td className="px-3 py-2.5">
                        {b.estValide ? (
                          <span className="rounded-full bg-[#DCFCE7] px-2 py-0.5 text-[10px] font-semibold text-[#166534]">
                            Valide
                          </span>
                        ) : (
                          <span className="rounded-full bg-[#F1F5F9] px-2 py-0.5 text-[10px] font-semibold text-[#64748B]">
                            Inactif
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => toggleValide(b)}
                          disabled={update.isPending}
                          className="rounded-[7px] border border-[rgba(15,76,129,0.15)] px-2.5 py-1 text-[11px] font-medium text-[#0F4C81] transition hover:bg-[#EFF6FF] disabled:opacity-50"
                        >
                          {b.estValide ? 'Désactiver' : 'Réactiver'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {update.isError && (
              <p className="mt-2 text-sm text-destructive">{apiErrorMessage(update.error, 'Modification impossible')}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------- Fiche employé (détail) -- */

const CREDIT_STATUT_META: Record<string, { label: string; cls: string }> = {
  EN_ATTENTE: { label: 'En attente', cls: 'bg-[#FFFBEB] text-[#B45309]' },
  APPROUVEE: { label: 'Approuvée', cls: 'bg-[#EFF6FF] text-[#1D4ED8]' },
  EN_COURS: { label: 'En cours', cls: 'bg-[#ECFEFF] text-[#0E7490]' },
  SOLDE: { label: 'Soldée', cls: 'bg-[#ECFDF5] text-[#047857]' },
  REJETEE: { label: 'Rejetée', cls: 'bg-[#FEF2F2] text-[#B42318]' },
  ANNULEE: { label: 'Annulée', cls: 'bg-[#F1F5F9] text-[#64748B]' },
};

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-[0.6px] text-[#94A3B8]">{label}</span>
      <span className="text-xs font-medium text-[#0F172A]">{children}</span>
    </div>
  );
}

function EmployeDetailModal({
  employe,
  onClose,
  onEdit,
  onBenefices,
}: {
  employe: Employe;
  onClose: () => void;
  onEdit: () => void;
  onBenefices: () => void;
}) {
  const { data: directions } = useDirections();
  const { data: portefeuilles } = usePortefeuilles();
  const { data: types } = useTypesBenefice();
  const { data: benefices, isLoading: benLoading } = useBenefices(employe.id);
  const { data: allCredits, isLoading: credLoading } = useCredits();

  const direction = directions?.find((d) => d.id === employe.directionId);
  const portefeuille = portefeuilles?.find((p) => p.id === employe.portefeuilleSourceId);
  const typeLabel = (id: string) => types?.find((t) => t.id === id)?.libelle ?? id;
  const credits = (allCredits ?? []).filter((c) => c.employeId === employe.id);
  const salaireInconnu = employe.salaire === null || employe.salaire === undefined;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-[13px] border border-[rgba(15,76,129,0.1)] bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* En-tête */}
        <div className="flex items-center justify-between border-b border-[rgba(15,76,129,0.07)] bg-[#F8FAFC] px-5 py-3">
          <div className="min-w-0">
            <div className="font-display text-sm font-semibold text-[#0F172A]">
              {employe.nom} {employe.prenoms}
            </div>
            <div className="text-[11px] text-[#64748B]">
              {employe.matricule}
              {!employe.estActif && ' · inactif'}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onBenefices}
              className="flex items-center gap-1.5 rounded-[8px] border border-[rgba(15,76,129,0.15)] px-2.5 py-1.5 text-[11px] font-medium text-[#0F4C81] hover:bg-[#F0FDF4]"
            >
              <Gift className="h-3.5 w-3.5" /> Bénéfices
            </button>
            <button
              type="button"
              onClick={onEdit}
              className="flex items-center gap-1.5 rounded-[8px] border border-[rgba(15,76,129,0.15)] px-2.5 py-1.5 text-[11px] font-medium text-[#1A6DB5] hover:bg-[#EFF6FF]"
            >
              <Pencil className="h-3.5 w-3.5" /> Modifier
            </button>
            <button
              type="button"
              aria-label="Fermer"
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-[7px] text-[#94A3B8] hover:bg-white hover:text-[#0F172A]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {/* Identité + salaire */}
          <section className="grid gap-4 rounded-[11px] border border-[rgba(15,76,129,0.1)] bg-[#FBFCFE] p-4 sm:grid-cols-3">
            <InfoRow label="Direction">{direction ? `${direction.code} — ${direction.libelle}` : '—'}</InfoRow>
            <InfoRow label="Salaire">
              {salaireInconnu ? <span className="text-[#CBD5E1]">•••• (non habilité)</span> : formatMontant(employe.salaire!)}
            </InfoRow>
            <InfoRow label="Statut">{employe.estActif ? 'Actif' : 'Inactif'}</InfoRow>
          </section>

          {/* Paiement */}
          <section>
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.6px] text-[#64748B]">
              <Banknote className="h-3.5 w-3.5" /> Paiement
            </div>
            <div className="grid gap-4 rounded-[11px] border border-[rgba(15,76,129,0.1)] bg-white p-4 sm:grid-cols-3">
              <InfoRow label="Mode de règlement">
                <span className="inline-flex items-center gap-1.5">
                  {employe.modeReglement === 'VIREMENT' ? (
                    <>
                      <CreditCard className="h-3.5 w-3.5 text-[#0E7490]" /> Virement bancaire
                    </>
                  ) : (
                    <>
                      <Wallet className="h-3.5 w-3.5 text-[#047857]" /> Espèces
                    </>
                  )}
                </span>
              </InfoRow>
              <InfoRow label="Portefeuille source">
                <span className="inline-flex items-center gap-1.5">
                  <Landmark className="h-3.5 w-3.5 text-[#0F4C81]" />
                  {portefeuille ? `${portefeuille.code} — ${portefeuille.libelle}` : '—'}
                </span>
              </InfoRow>
              {employe.modeReglement === 'VIREMENT' && (
                <>
                  <InfoRow label="Banque">{employe.banque || '—'}</InfoRow>
                  <InfoRow label="RIB / compte">{employe.rib || '—'}</InfoRow>
                </>
              )}
            </div>
          </section>

          {/* Bénéfices */}
          <section>
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.6px] text-[#64748B]">
              <Gift className="h-3.5 w-3.5" /> Bénéfices
            </div>
            {benLoading ? (
              <div className="py-4 text-sm text-[#64748B]">Chargement…</div>
            ) : !benefices || benefices.length === 0 ? (
              <div className="rounded-[10px] border border-dashed border-[rgba(15,76,129,0.15)] py-5 text-center text-xs text-[#94A3B8]">
                Aucun bénéfice.
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead className="bg-[#F8FAFC]">
                  <tr className="text-left text-[10px] uppercase tracking-[0.6px] text-[#64748B]">
                    <th className="px-3 py-2 font-semibold">Type</th>
                    <th className="px-3 py-2 font-semibold">Montant</th>
                    <th className="px-3 py-2 font-semibold">Période</th>
                    <th className="px-3 py-2 font-semibold">État</th>
                  </tr>
                </thead>
                <tbody>
                  {benefices.map((b) => (
                    <tr key={b.id} className="border-t border-[rgba(15,76,129,0.07)]">
                      <td className="px-3 py-2 font-medium">{typeLabel(b.typeBeneficeId)}</td>
                      <td className="px-3 py-2 tabular-nums">{formatMontant(b.montant)}</td>
                      <td className="px-3 py-2 text-[#64748B]">
                        {b.dateDebut} → {b.dateFin}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                            b.estValide ? 'bg-[#DCFCE7] text-[#166534]' : 'bg-[#F1F5F9] text-[#64748B]',
                          )}
                        >
                          {b.estValide ? 'Valide' : 'Inactif'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {/* Crédits */}
          <section>
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.6px] text-[#64748B]">
              <CreditCard className="h-3.5 w-3.5" /> Crédits / avances
            </div>
            {credLoading ? (
              <div className="py-4 text-sm text-[#64748B]">Chargement…</div>
            ) : credits.length === 0 ? (
              <div className="rounded-[10px] border border-dashed border-[rgba(15,76,129,0.15)] py-5 text-center text-xs text-[#94A3B8]">
                Aucun crédit.
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead className="bg-[#F8FAFC]">
                  <tr className="text-left text-[10px] uppercase tracking-[0.6px] text-[#64748B]">
                    <th className="px-3 py-2 font-semibold">Montant</th>
                    <th className="px-3 py-2 font-semibold">Mois</th>
                    <th className="px-3 py-2 font-semibold">Début</th>
                    <th className="px-3 py-2 font-semibold">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {credits.map((c) => {
                    const meta = CREDIT_STATUT_META[c.statut] ?? { label: c.statut, cls: 'bg-[#F1F5F9] text-[#64748B]' };
                    return (
                      <tr key={c.id} className="border-t border-[rgba(15,76,129,0.07)]">
                        <td className="px-3 py-2 tabular-nums font-medium">{formatMontant(c.montant)}</td>
                        <td className="px-3 py-2 text-[#64748B]">{c.nbMois}</td>
                        <td className="px-3 py-2 text-[#64748B]">{c.dateDebut}</td>
                        <td className="px-3 py-2">
                          <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', meta.cls)}>
                            {meta.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Page -- */

export function EmployesPage() {
  // Recherche, filtre direction et tri : tout est envoyé au serveur (exécuté en base).
  const sort = useTableSort<EmpSortCol>('/employes', EMP_SORT_COLUMNS, { by: 'nom', dir: 'asc' });
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [directionId, setDirectionId] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data: employes, isLoading, isError } = useEmployes({
    search: debouncedSearch || undefined,
    directionId: directionId || undefined,
    sortBy: sort.state.by ?? undefined,
    sortDir: sort.state.by ? sort.state.dir : undefined,
  });
  const { data: directions } = useDirections();
  const remove = useDeleteEmploye();
  const importMut = useImportEmployes();
  const apercuMut = useApercuImportEmployes();
  const fileRef = useRef<HTMLInputElement>(null);
  const [importResult, setImportResult] = useState<{ crees: number; ignores: number; erreurs: string[] } | null>(null);
  const [aideOpen, setAideOpen] = useState(false);
  const [apercu, setApercu] = useState<ApercuImport | null>(null);
  const [apercuFile, setApercuFile] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [modeleLoading, setModeleLoading] = useState(false);
  const [dlError, setDlError] = useState<string | null>(null);

  const exportFilters = {
    search: debouncedSearch || undefined,
    directionId: directionId || undefined,
    sortBy: sort.state.by ?? undefined,
    sortDir: sort.state.by ? sort.state.dir : undefined,
  };
  const handleExport = async () => {
    setDlError(null);
    setExporting(true);
    try {
      await exportEmployes(exportFilters);
    } catch (e) {
      setDlError(apiErrorMessage(e, 'Export impossible'));
    } finally {
      setExporting(false);
    }
  };
  const handleModele = async () => {
    setDlError(null);
    setModeleLoading(true);
    try {
      await telechargerModeleEmployes();
    } catch (e) {
      setDlError(apiErrorMessage(e, 'Téléchargement du modèle impossible'));
    } finally {
      setModeleLoading(false);
    }
  };

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Employe | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Employe | null>(null);
  const [beneficesFor, setBeneficesFor] = useState<Employe | null>(null);
  const [detailFor, setDetailFor] = useState<Employe | null>(null);

  const directionLabel = (id?: string | null) => {
    if (!id) return '—';
    const d = directions?.find((x) => x.id === id);
    return d ? d.code : '—';
  };

  const openCreate = () => {
    setEditing(null);
    setShowForm(true);
  };
  const openEdit = (e: Employe) => {
    setEditing(e);
    setShowForm(true);
  };
  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
  };

  // Choix d'un fichier → on ne l'importe PAS directement : on demande d'abord un
  // aperçu (dry-run) au serveur, affiché dans une modale de confirmation.
  const onPickFile = (ev: React.ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    setImportResult(null);
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = String(reader.result).replace(/^data:.*;base64,/, '');
      apercuMut.mutate(base64, {
        onSuccess: (r) => {
          setApercuFile(base64);
          setApercu(r);
          setAideOpen(false);
        },
      });
    };
    reader.readAsDataURL(file);
    ev.target.value = ''; // permet de re-sélectionner le même fichier
  };

  const closeApercu = () => {
    setApercu(null);
    setApercuFile(null);
  };

  // Confirmation depuis la modale d'aperçu → import réel du fichier déjà sélectionné.
  const confirmImport = () => {
    if (!apercuFile) return;
    importMut.mutate(apercuFile, {
      onSuccess: (r) => {
        setImportResult(r);
        closeApercu();
      },
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center"
          onClick={closeForm}
        >
          <div className="w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <EmployeForm key={editing?.id ?? 'new'} employe={editing ?? undefined} onDone={closeForm} />
          </div>
        </div>
      )}

      {/* Modale d'aide : format attendu + exemple + modèle + choix du fichier */}
      {aideOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center"
          onClick={() => setAideOpen(false)}
        >
          <div className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <Panel>
              <PanelHeader title="Importer des employés">
                <button
                  type="button"
                  aria-label="Fermer"
                  onClick={() => setAideOpen(false)}
                  className="ml-auto flex h-7 w-7 items-center justify-center rounded-[7px] text-[#94A3B8] hover:bg-[#F1F5F9] hover:text-[#0F172A]"
                >
                  <X className="h-4 w-4" />
                </button>
              </PanelHeader>
              <div className="space-y-3 p-[18px] text-xs text-[#475569]">
                <p>
                  Fichier Excel (.xlsx) avec les <strong>en-têtes en première ligne</strong>. Colonnes
                  reconnues (casse et accents ignorés) :
                </p>
                <ul className="space-y-1">
                  <li>
                    <span className="font-semibold text-[#0F172A]">Matricule</span>,{' '}
                    <span className="font-semibold text-[#0F172A]">Nom</span>,{' '}
                    <span className="font-semibold text-[#0F172A]">Prénoms</span> —{' '}
                    <span className="text-[#B42318]">requis</span>
                  </li>
                  <li>
                    <span className="font-semibold text-[#0F172A]">Direction</span> (code ou libellé) et{' '}
                    <span className="font-semibold text-[#0F172A]">Salaire</span> — optionnels
                  </li>
                </ul>
                <div className="overflow-x-auto rounded-[9px] border border-[rgba(15,76,129,0.1)]">
                  <table className="w-full text-[11px]">
                    <thead className="bg-[#F8FAFC] text-left text-[10px] uppercase tracking-[0.5px] text-[#64748B]">
                      <tr>
                        <th className="px-2 py-1.5 font-semibold">Matricule</th>
                        <th className="px-2 py-1.5 font-semibold">Nom</th>
                        <th className="px-2 py-1.5 font-semibold">Prénoms</th>
                        <th className="px-2 py-1.5 font-semibold">Direction</th>
                        <th className="px-2 py-1.5 font-semibold">Salaire</th>
                      </tr>
                    </thead>
                    <tbody className="text-[#475569]">
                      <tr className="border-t border-[rgba(15,76,129,0.06)]">
                        <td className="px-2 py-1.5">MAT001</td>
                        <td className="px-2 py-1.5">Diallo</td>
                        <td className="px-2 py-1.5">Awa</td>
                        <td className="px-2 py-1.5">DG</td>
                        <td className="px-2 py-1.5">500000</td>
                      </tr>
                      <tr className="border-t border-[rgba(15,76,129,0.06)]">
                        <td className="px-2 py-1.5">MAT002</td>
                        <td className="px-2 py-1.5">Traoré</td>
                        <td className="px-2 py-1.5">Ibrahim</td>
                        <td className="px-2 py-1.5">DAF</td>
                        <td className="px-2 py-1.5">350000</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleModele}
                    disabled={modeleLoading}
                    className="flex items-center gap-1.5 rounded-[9px] border border-[rgba(15,76,129,0.15)] px-3 py-1.5 font-medium text-[#0F4C81] transition hover:bg-[#EFF6FF] disabled:opacity-50"
                  >
                    {modeleLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />} Télécharger le modèle
                  </button>
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={apercuMut.isPending}
                    className="flex items-center gap-1.5 rounded-[9px] bg-[#0F4C81] px-3 py-1.5 font-medium text-white transition hover:bg-[#1A6DB5] disabled:opacity-50"
                  >
                    {apercuMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Choisir un fichier
                  </button>
                </div>
                {dlError && <p className="text-destructive">{dlError}</p>}
                {apercuMut.isError && (
                  <p className="text-destructive">{apiErrorMessage(apercuMut.error, 'Fichier illisible')}</p>
                )}
              </div>
            </Panel>
          </div>
        </div>
      )}

      {/* Modale d'aperçu (dry-run) avant import réel */}
      {apercu && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center"
          onClick={closeApercu}
        >
          <div className="w-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
            <Panel>
              <PanelHeader title="Aperçu de l'import">
                <button
                  type="button"
                  aria-label="Fermer"
                  onClick={closeApercu}
                  className="ml-auto flex h-7 w-7 items-center justify-center rounded-[7px] text-[#94A3B8] hover:bg-[#F1F5F9] hover:text-[#0F172A]"
                >
                  <X className="h-4 w-4" />
                </button>
              </PanelHeader>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-[rgba(15,76,129,0.07)] bg-[#F8FAFC] px-[18px] py-2.5 text-xs">
                <span className="font-medium text-[#0F172A]">{apercu.resume.total} ligne(s)</span>
                <span className="text-[#047857]">{apercu.resume.aCreer} à créer</span>
                <span className="text-[#B45309]">{apercu.resume.ignores} ignorée(s)</span>
                <span className="text-[#B42318]">{apercu.resume.erreurs} en erreur</span>
              </div>
              <div className="max-h-[50vh] overflow-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-[#F8FAFC] text-left text-[10px] uppercase tracking-[0.5px] text-[#64748B]">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Ligne</th>
                      <th className="px-3 py-2 font-semibold">Matricule</th>
                      <th className="px-3 py-2 font-semibold">Nom</th>
                      <th className="px-3 py-2 font-semibold">Prénoms</th>
                      <th className="px-3 py-2 font-semibold">Direction</th>
                      <th className="px-3 py-2 font-semibold">Salaire</th>
                      <th className="px-3 py-2 font-semibold">Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {apercu.lignes.map((l) => {
                      const m = STATUT_META[l.statut];
                      return (
                        <tr key={l.ligne} className="border-t border-[rgba(15,76,129,0.05)] align-top">
                          <td className="px-3 py-2 text-[#94A3B8]">{l.ligne}</td>
                          <td className="px-3 py-2 font-medium text-[#0F172A]">{l.matricule || '—'}</td>
                          <td className="px-3 py-2">{l.nom || '—'}</td>
                          <td className="px-3 py-2">{l.prenoms || '—'}</td>
                          <td className="px-3 py-2">{l.direction || '—'}</td>
                          <td className="px-3 py-2 tabular-nums">{l.salaire || '—'}</td>
                          <td className="px-3 py-2">
                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${m.cls}`}>
                              <m.Icon className="h-3 w-3" /> {m.label}
                            </span>
                            {l.message && <div className="mt-0.5 text-[10px] text-[#94A3B8]">{l.message}</div>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-end gap-2 border-t border-[rgba(15,76,129,0.07)] px-[18px] py-3">
                <button
                  type="button"
                  onClick={closeApercu}
                  className="rounded-[9px] border border-[rgba(15,76,129,0.15)] px-3.5 py-1.5 text-xs font-medium text-[#475569] transition hover:bg-[#F1F5F9]"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={confirmImport}
                  disabled={importMut.isPending || apercu.resume.aCreer === 0}
                  className="flex items-center gap-1.5 rounded-[9px] bg-[#0F4C81] px-3.5 py-1.5 text-xs font-medium text-white transition hover:bg-[#1A6DB5] disabled:opacity-50"
                >
                  {importMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Confirmer l'import ({apercu.resume.aCreer})
                </button>
              </div>
              {importMut.isError && (
                <div className="px-[18px] pb-3 text-xs text-destructive">
                  {apiErrorMessage(importMut.error, 'Import impossible')}
                </div>
              )}
            </Panel>
          </div>
        </div>
      )}

      <Panel>
        <PanelHeader title="Employés" badge={`${employes?.length ?? 0}`}>
          <div className="ml-auto flex items-center gap-2">
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={onPickFile} />
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting}
              className="flex items-center gap-1.5 rounded-[9px] border border-[rgba(15,76,129,0.15)] px-3.5 py-1.5 text-[11px] font-medium text-[#0F4C81] transition hover:bg-[#EFF6FF] disabled:opacity-50"
            >
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Exporter (Excel)
            </button>
            <button
              type="button"
              onClick={() => {
                setImportResult(null);
                setAideOpen(true);
              }}
              disabled={apercuMut.isPending || importMut.isPending}
              className="flex items-center gap-1.5 rounded-[9px] border border-[rgba(15,76,129,0.15)] px-3.5 py-1.5 text-[11px] font-medium text-[#0F4C81] transition hover:bg-[#EFF6FF] disabled:opacity-50"
            >
              {apercuMut.isPending || importMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Importer (Excel)
            </button>
            <button
              type="button"
              onClick={openCreate}
              className="flex items-center gap-1.5 rounded-[9px] bg-[#0F4C81] px-3.5 py-1.5 text-[11px] font-medium text-white transition hover:bg-[#1A6DB5]"
            >
              <Plus className="h-4 w-4" /> Nouvel employé
            </button>
          </div>
        </PanelHeader>

        {(importResult || importMut.isError || dlError) && (
          <div className="border-b border-[rgba(15,76,129,0.07)] bg-[#F8FAFC] px-[18px] py-3 text-xs">
            {dlError && <div className="text-destructive">{dlError}</div>}
            {importMut.isError && (
              <span className="text-destructive">{apiErrorMessage(importMut.error, 'Import impossible')}</span>
            )}
            {importResult && (
              <div>
                <span className="font-medium text-[#16A34A]">{importResult.crees} créé(s)</span>
                {importResult.ignores > 0 && <span className="text-[#B45309]"> · {importResult.ignores} ignoré(s)</span>}
                {importResult.erreurs.length > 0 && (
                  <ul className="mt-1 list-disc pl-5 text-[#B45309]">
                    {importResult.erreurs.slice(0, 8).map((er, i) => (
                      <li key={i}>{er}</li>
                    ))}
                    {importResult.erreurs.length > 8 && <li>… {importResult.erreurs.length - 8} autre(s)</li>}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 border-b border-[rgba(15,76,129,0.07)] px-[18px] py-3">
          <div className="flex flex-1 items-center gap-2">
            <Search className="h-4 w-4 text-[#64748B]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher (nom, prénoms ou matricule)…"
              className="w-full rounded-[9px] border border-[rgba(15,76,129,0.1)] bg-[#F8FAFC] px-3 py-1.5 text-xs text-[#0F172A] outline-none focus:border-[#1A6DB5] focus:bg-white"
            />
          </div>
          <select
            value={directionId}
            onChange={(e) => setDirectionId(e.target.value)}
            className="rounded-[9px] border border-[rgba(15,76,129,0.1)] bg-white px-3 py-1.5 text-xs text-[#0F172A] outline-none focus:border-[#1A6DB5]"
          >
            <option value="">Toutes les directions</option>
            {(directions ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.code} — {d.libelle}
              </option>
            ))}
          </select>
        </div>

        {isLoading && <div className="px-[18px] py-8 text-sm text-[#64748B]">Chargement…</div>}
        {isError && <div className="px-[18px] py-8 text-sm text-[#EF4444]">Impossible de charger les employés.</div>}

        {employes && (
          <table className="w-full text-xs">
            <thead className="bg-[#F8FAFC]">
              <tr className="text-left text-[10px] uppercase tracking-[0.7px] text-[#64748B]">
                <SortableHeader column="matricule" state={sort.state} onSort={sort.setSort}>Matricule</SortableHeader>
                <SortableHeader column="nom" state={sort.state} onSort={sort.setSort}>Nom</SortableHeader>
                <SortableHeader column="prenoms" state={sort.state} onSort={sort.setSort}>Prénoms</SortableHeader>
                <th className="px-4 py-2.5 font-semibold">Direction</th>
                <SortableHeader column="salaire" state={sort.state} onSort={sort.setSort}>Salaire</SortableHeader>
                <th className="px-4 py-2.5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {employes.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-[#64748B]">
                    Aucun employé.
                  </td>
                </tr>
              )}
              {employes.map((e) => (
                <tr
                  key={e.id}
                  onClick={() => setDetailFor(e)}
                  className="cursor-pointer border-t border-[rgba(15,76,129,0.07)] hover:bg-[#FAFBFF]"
                  title="Voir la fiche"
                >
                  <td className="px-4 py-3 font-medium">{e.matricule}</td>
                  <td className="px-4 py-3">{e.nom}</td>
                  <td className="px-4 py-3">{e.prenoms}</td>
                  <td className="px-4 py-3 text-[#64748B]">{directionLabel(e.directionId)}</td>
                  <td className="px-4 py-3 text-[#64748B]">
                    {e.salaire === null || e.salaire === undefined ? (
                      <span className="text-[#CBD5E1]">••••</span>
                    ) : (
                      formatMontant(e.salaire)
                    )}
                  </td>
                  <td className="px-4 py-3 text-right" onClick={(ev) => ev.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        aria-label="Bénéfices"
                        title={
                          (e.nbBenefices ?? 0) > 0
                            ? `${e.nbBenefices} bénéfice${(e.nbBenefices ?? 0) > 1 ? 's' : ''} actif${(e.nbBenefices ?? 0) > 1 ? 's' : ''} — gérer`
                            : 'Aucun bénéfice — en accorder'
                        }
                        onClick={() => setBeneficesFor(e)}
                        className="relative inline-flex h-9 w-9 items-center justify-center rounded-[9px] text-[#64748B] transition-colors hover:bg-[#F0FDF4] hover:text-[#16A34A]"
                      >
                        <Gift className="h-5 w-5" />
                        {(e.nbBenefices ?? 0) > 0 && (
                          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#16A34A] px-1 text-[9px] font-bold leading-none text-white">
                            {e.nbBenefices}
                          </span>
                        )}
                      </button>
                      <button
                        type="button"
                        aria-label="Modifier"
                        title="Modifier l'employé"
                        onClick={() => openEdit(e)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-[9px] text-[#64748B] transition-colors hover:bg-[#EFF6FF] hover:text-[#1A6DB5]"
                      >
                        <Pencil className="h-5 w-5" />
                      </button>
                      <button
                        type="button"
                        aria-label="Supprimer"
                        title="Désactiver l'employé"
                        onClick={() => setPendingDelete(e)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-[9px] text-[#64748B] transition-colors hover:bg-[#FEF2F2] hover:text-[#EF4444]"
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      {detailFor && (
        <EmployeDetailModal
          employe={detailFor}
          onClose={() => setDetailFor(null)}
          onEdit={() => {
            const emp = detailFor;
            setDetailFor(null);
            openEdit(emp);
          }}
          onBenefices={() => {
            const emp = detailFor;
            setDetailFor(null);
            setBeneficesFor(emp);
          }}
        />
      )}

      {beneficesFor && <BeneficesModal employe={beneficesFor} onClose={() => setBeneficesFor(null)} />}

      <ConfirmDialog
        open={!!pendingDelete}
        variant="danger"
        title={pendingDelete ? `Supprimer ${pendingDelete.nom} ${pendingDelete.prenoms} ?` : ''}
        description={pendingDelete ? "L'employé sera désactivé (retiré de la liste). Ses bénéfices restent en base." : undefined}
        confirmLabel="Supprimer"
        busy={remove.isPending}
        error={remove.isError ? apiErrorMessage(remove.error, 'Suppression impossible') : undefined}
        onCancel={() => {
          setPendingDelete(null);
          remove.reset();
        }}
        onConfirm={() => {
          if (!pendingDelete) return;
          remove.mutate(pendingDelete.id, { onSuccess: () => setPendingDelete(null) });
        }}
      />
    </div>
  );
}
