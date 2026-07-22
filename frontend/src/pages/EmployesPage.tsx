import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileDown,
  Gift,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
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
import { useDirections } from '@/api/directions';
import { apiErrorMessage, formatMontant } from '@/lib/utils';
import type { Employe, EmployeBenefice } from '@/types/api';
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
});
type FormValues = z.infer<typeof schema>;

function EmployeForm({ employe, onDone }: { employe?: Employe; onDone: () => void }) {
  const isEdit = !!employe;
  const create = useCreateEmploye();
  const update = useUpdateEmploye();
  const { data: directions } = useDirections();
  const {
    register,
    handleSubmit,
    reset,
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
        }
      : undefined,
  });

  const pending = create.isPending || update.isPending;
  const mutError = create.error || update.error;
  const hasError = create.isError || update.isError;

  const onSubmit = handleSubmit((values) => {
    const done = () => {
      reset();
      onDone();
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

const beneficeSchema = z
  .object({
    typeBeneficeId: z.string().trim().min(1, 'Requis'),
    montant: z.string().trim().min(1, 'Requis'),
    dateDebut: z.string().trim().min(1, 'Requis'),
    dateFin: z.string().trim().min(1, 'Requis'),
    commentaire: z.string().optional(),
  })
  .refine((v) => v.dateFin >= v.dateDebut, { message: 'La fin doit suivre le début', path: ['dateFin'] });
type BeneficeFormValues = z.infer<typeof beneficeSchema>;

function BeneficesModal({ employe, onClose }: { employe: Employe; onClose: () => void }) {
  const { data: benefices, isLoading } = useBenefices(employe.id);
  const { data: types } = useTypesBenefice();
  const create = useCreateBenefice(employe.id);
  const update = useUpdateBenefice(employe.id);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<BeneficeFormValues>({ resolver: zodResolver(beneficeSchema) });

  const typeLabel = (id: string) => types?.find((t) => t.id === id)?.libelle ?? id;

  const onSubmit = handleSubmit((values) => {
    create.mutate(
      {
        typeBeneficeId: values.typeBeneficeId,
        montant: values.montant,
        dateDebut: values.dateDebut,
        dateFin: values.dateFin,
        commentaire: values.commentaire || undefined,
      },
      { onSuccess: () => reset({ typeBeneficeId: '', montant: '', dateDebut: '', dateFin: '', commentaire: '' }) },
    );
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
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="montant">Montant</Label>
              <Input id="montant" type="number" min="0" step="1" placeholder="Ex : 500000" {...register('montant')} />
              {errors.montant && <p className="text-sm text-destructive">{errors.montant.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dateDebut">Début de validité</Label>
              <Input id="dateDebut" type="date" {...register('dateDebut')} />
              {errors.dateDebut && <p className="text-sm text-destructive">{errors.dateDebut.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dateFin">Fin de validité</Label>
              <Input id="dateFin" type="date" {...register('dateFin')} />
              {errors.dateFin && <p className="text-sm text-destructive">{errors.dateFin.message}</p>}
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="commentaire">Commentaire (optionnel)</Label>
              <Input id="commentaire" {...register('commentaire')} />
            </div>
            <div className="flex items-center gap-2 sm:col-span-2">
              <Button type="submit" disabled={create.isPending}>
                <Plus className="mr-1 h-4 w-4" />
                {create.isPending ? 'Ajout…' : 'Accorder le bénéfice'}
              </Button>
              {create.isError && (
                <p className="text-sm text-destructive">{apiErrorMessage(create.error, 'Ajout impossible')}</p>
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
                <tr key={e.id} className="border-t border-[rgba(15,76,129,0.07)] hover:bg-[#FAFBFF]">
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
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        aria-label="Bénéfices"
                        title="Gérer les bénéfices"
                        onClick={() => setBeneficesFor(e)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-[7px] text-[#94A3B8] transition-colors hover:bg-[#F0FDF4] hover:text-[#16A34A]"
                      >
                        <Gift className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label="Modifier"
                        onClick={() => openEdit(e)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-[7px] text-[#94A3B8] transition-colors hover:bg-[#EFF6FF] hover:text-[#1A6DB5]"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label="Supprimer"
                        onClick={() => setPendingDelete(e)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-[7px] text-[#94A3B8] transition-colors hover:bg-[#FEF2F2] hover:text-[#EF4444]"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

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
