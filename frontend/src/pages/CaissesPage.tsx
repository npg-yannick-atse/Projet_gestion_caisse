import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertTriangle, Landmark, Pencil, Plus, Power, PowerOff, Trash2, UserCog, Wallet, X } from 'lucide-react';
import {
  useCaisses,
  useCaisseSolde,
  useOpenCaisse,
  useCloseCaisse,
  useCreateCaisse,
  useUpdateCaisse,
  useDeleteCaisse,
  useToggleCaisseActive,
} from '@/api/caisses';
import {
  useDevises,
  usePortefeuilles,
  usePortefeuilleSolde,
  useCreatePortefeuille,
  useUpdatePortefeuille,
  useDeletePortefeuille,
  useTogglePortefeuilleActive,
} from '@/api/financierRef';
import { useUsers, useUserRoles, useMyPermissions } from '@/api/users';
import { useDirections } from '@/api/directions';
import { useAuthStore } from '@/stores/auth.store';
import { apiErrorMessage, cn, formatMontant } from '@/lib/utils';
import type { Caisse, Portefeuille } from '@/types/api';

/** Droits de gestion caisses/portefeuilles de l'utilisateur connecté (permission, admin = bypass). */
function useFinancePerms() {
  const user = useAuthStore((s) => s.user);
  const { data: roles } = useUserRoles(user?.id ?? null);
  const { data: perms } = useMyPermissions(user?.id ?? null);
  const codes = new Set((roles ?? []).map((r) => r.code));
  const isAdmin = codes.has('SUPER_ADMIN') || codes.has('ADMINISTRATEUR');
  const p = new Set(perms ?? []);
  return {
    isAdmin,
    canManageCaisse: isAdmin || p.has('CAISSE_MODIFIER'),
    canDeleteCaisse: isAdmin || p.has('CAISSE_SUPPRIMER'),
    canManagePf: isAdmin || p.has('PORTEFEUILLE_MODIFIER'),
    canDeletePf: isAdmin || p.has('PORTEFEUILLE_SUPPRIMER'),
    canOpenClose: isAdmin || codes.has('CAISSIER'),
  };
}
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Panel } from '@/components/ui/panel';

const selectClass =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

// ============================================================
// CRÉATION CAISSE (inline)
// ============================================================
const createCaisseSchema = z.object({
  code: z.string().min(1, 'Requis'),
  libelle: z.string().min(1, 'Requis'),
  deviseId: z.string().min(1, 'Devise requise'),
  estPrincipale: z.boolean().optional(),
});
type CreateCaisseFormValues = z.infer<typeof createCaisseSchema>;

function CreateCaisseModal({ onClose }: { onClose: () => void }) {
  const { data: devises } = useDevises();
  const createCaisse = useCreateCaisse();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateCaisseFormValues>({ resolver: zodResolver(createCaisseSchema) });

  const onSubmit = handleSubmit((values) => {
    createCaisse.mutate(values, {
      onSuccess: () => {
        reset();
        onClose();
      },
    });
  });

  return (
    <ModalOverlay title="Nouvelle caisse" onClose={onClose}>
      <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="code">Code</Label>
          <Input id="code" {...register('code')} />
          {errors.code && <p className="text-sm text-destructive">{errors.code.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="libelle">Libellé</Label>
          <Input id="libelle" {...register('libelle')} />
          {errors.libelle && <p className="text-sm text-destructive">{errors.libelle.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="deviseId">Devise</Label>
          <select id="deviseId" className={selectClass} {...register('deviseId')}>
            <option value="">— Choisir —</option>
            {devises?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.code} — {d.libelle}
              </option>
            ))}
          </select>
          {errors.deviseId && <p className="text-sm text-destructive">{errors.deviseId.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label>Caisse principale</Label>
          <label className="flex h-10 items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4" {...register('estPrincipale')} />
            Marquer comme principale
          </label>
        </div>
        <div className="flex items-center gap-2 sm:col-span-2">
          <Button type="submit" disabled={createCaisse.isPending}>
            {createCaisse.isPending ? 'Création…' : 'Créer'}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          {createCaisse.isError && (
            <p className="text-sm text-destructive">{apiErrorMessage(createCaisse.error, 'Création impossible')}</p>
          )}
        </div>
      </form>
    </ModalOverlay>
  );
}

// ============================================================
// ÉDITION CAISSE (modal)
// ============================================================
const editCaisseSchema = z.object({
  code: z.string().min(1),
  libelle: z.string().min(1),
  deviseId: z.string().min(1),
  estPrincipale: z.boolean().optional(),
});
type EditCaisseFormValues = z.infer<typeof editCaisseSchema>;

function EditCaisseModal({ caisse, onClose }: { caisse: Caisse; onClose: () => void }) {
  const { data: devises } = useDevises();
  const update = useUpdateCaisse();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<EditCaisseFormValues>({
    resolver: zodResolver(editCaisseSchema),
    defaultValues: {
      code: caisse.code,
      libelle: caisse.libelle,
      // Coercition défensive : un id renvoyé en nombre casserait la validation z.string().
      deviseId: caisse.deviseId != null ? String(caisse.deviseId) : '',
      estPrincipale: caisse.estPrincipale,
    },
  });

  const onSubmit = handleSubmit((values) => {
    update.mutate({ id: caisse.id, payload: values }, { onSuccess: () => onClose() });
  });

  return (
    <ModalOverlay title={`Modifier la caisse ${caisse.code}`} onClose={onClose}>
      <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="edit-code">Code</Label>
          <Input id="edit-code" {...register('code')} />
          {errors.code && <p className="text-sm text-destructive">{errors.code.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-libelle">Libellé</Label>
          <Input id="edit-libelle" {...register('libelle')} />
          {errors.libelle && <p className="text-sm text-destructive">{errors.libelle.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-devise">Devise</Label>
          <select id="edit-devise" className={selectClass} {...register('deviseId')}>
            {devises?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.code} — {d.libelle}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Caisse principale</Label>
          <label className="flex h-10 items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4" {...register('estPrincipale')} />
            Marquer comme principale
          </label>
        </div>
        <div className="flex items-center gap-2 sm:col-span-2">
          <Button type="submit" disabled={update.isPending}>
            {update.isPending ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          {update.isError && (
            <p className="text-sm text-destructive">{apiErrorMessage(update.error, 'Modification impossible')}</p>
          )}
        </div>
      </form>
    </ModalOverlay>
  );
}

// ============================================================
// ÉDITION PORTEFEUILLE (modal)
// ============================================================
const editPortefeuilleSchema = z.object({
  code: z.string().min(1),
  libelle: z.string().min(1),
  gestionnaireId: z.string().optional(),
  soldeInitial: z
    .string()
    .optional()
    .refine((v) => !v || /^\d+(\.\d{1,4})?$/.test(v), 'Montant invalide'),
});
type EditPortefeuilleFormValues = z.infer<typeof editPortefeuilleSchema>;

/** Avertit si le user sélectionné n'a pas le rôle GESTIONNAIRE_PORTEFEUILLE. */
function GestionnaireRoleWarning({ userId }: { userId: string }) {
  const { data: roles } = useUserRoles(userId || null);
  if (!userId) return null;
  if (roles === undefined) return null; // chargement
  const hasRole = (roles ?? []).some((r) => r.code === 'GESTIONNAIRE_PORTEFEUILLE');
  if (hasRole) {
    return (
      <p className="mt-1 text-[11px] text-[#047857]">
        ✓ L'utilisateur possède le rôle Gestionnaire de portefeuille.
      </p>
    );
  }
  return (
    <div className="mt-1 flex items-start gap-1.5 rounded-[8px] bg-[#FFFBEB] px-2 py-1.5 text-[11px] text-[#92400E]">
      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
      <span>
        Cet utilisateur n'a pas le rôle <strong>Gestionnaire de portefeuille</strong> — il ne verra
        pas le dashboard dédié tant que le rôle n'est pas attribué.
      </span>
    </div>
  );
}

function EditPortefeuilleModal({ portefeuille, onClose }: { portefeuille: Portefeuille; onClose: () => void }) {
  const update = useUpdatePortefeuille();
  const { data: users } = useUsers();
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<EditPortefeuilleFormValues>({
    resolver: zodResolver(editPortefeuilleSchema),
    defaultValues: {
      code: portefeuille.code,
      libelle: portefeuille.libelle,
      gestionnaireId: portefeuille.gestionnaireId != null ? String(portefeuille.gestionnaireId) : '',
      // soldeInitial est un DECIMAL : selon le driver il peut arriver en nombre → on force la string.
      soldeInitial: portefeuille.soldeInitial != null ? String(portefeuille.soldeInitial) : '',
    },
  });

  const selectedGestionnaire = watch('gestionnaireId') ?? '';

  const onSubmit = handleSubmit((values) => {
    update.mutate(
      {
        id: portefeuille.id,
        payload: {
          code: values.code,
          libelle: values.libelle,
          // Chaîne vide = désaffectation → on envoie null côté backend via undefined ignoré côté DTO.
          // Pour réellement désaffecter, on envoie une valeur spéciale : ici on omet si vide.
          gestionnaireId: values.gestionnaireId ? values.gestionnaireId : undefined,
          soldeInitial: values.soldeInitial || undefined,
        },
      },
      { onSuccess: () => onClose() },
    );
  });

  return (
    <ModalOverlay title={`Modifier le portefeuille ${portefeuille.code}`} onClose={onClose}>
      <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="pf-edit-code">Code</Label>
          <Input id="pf-edit-code" {...register('code')} />
          {errors.code && <p className="text-sm text-destructive">{errors.code.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pf-edit-libelle">Libellé</Label>
          <Input id="pf-edit-libelle" {...register('libelle')} />
          {errors.libelle && <p className="text-sm text-destructive">{errors.libelle.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="pf-edit-solde">Solde initial</Label>
          <Input id="pf-edit-solde" inputMode="decimal" placeholder="0" {...register('soldeInitial')} />
          {errors.soldeInitial && (
            <p className="text-sm text-destructive">{errors.soldeInitial.message}</p>
          )}
        </div>

        <div className="sm:col-span-2 space-y-1.5">
          <Label htmlFor="pf-edit-gest" className="flex items-center gap-1.5">
            <UserCog className="h-3.5 w-3.5 text-[#1A6DB5]" />
            Gestionnaire <span className="text-xs font-normal text-[#64748B]">(optionnel)</span>
          </Label>
          <select id="pf-edit-gest" className={selectClass} {...register('gestionnaireId')}>
            <option value="">— Aucun gestionnaire —</option>
            {users?.map((u) => (
              <option key={u.id} value={u.id}>
                {u.prenom} {u.nom} (#{u.matricule})
              </option>
            ))}
          </select>
          <p className="text-[11px] text-[#64748B]">
            Le gestionnaire pilote l'enveloppe et arbitre les demandes d'extension.
          </p>
          <GestionnaireRoleWarning userId={selectedGestionnaire} />
        </div>

        <div className="flex items-center gap-2 sm:col-span-2">
          <Button type="submit" disabled={update.isPending}>
            {update.isPending ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          {update.isError && (
            <p className="text-sm text-destructive">{apiErrorMessage(update.error, 'Modification impossible')}</p>
          )}
        </div>
      </form>
    </ModalOverlay>
  );
}

// ============================================================
// CRÉATION PORTEFEUILLE INLINE (à l'intérieur d'une caisse)
// ============================================================
const createPortefeuilleSchema = z.object({
  code: z.string().min(1, 'Requis'),
  libelle: z.string().min(1, 'Requis'),
  proprietaireType: z.enum(['USER', 'DIRECTION']),
  proprietaireId: z.string().min(1, 'Propriétaire requis'),
  gestionnaireId: z.string().optional(),
  soldeInitial: z.string().optional(),
});
type CreatePortefeuilleFormValues = z.infer<typeof createPortefeuilleSchema>;

function NewPortefeuilleInline({
  caisseId,
  deviseId,
  onDone,
}: {
  caisseId: string;
  deviseId: string;
  onDone: () => void;
}) {
  const { data: users } = useUsers();
  const { data: directions } = useDirections();
  const create = useCreatePortefeuille();
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CreatePortefeuilleFormValues>({
    resolver: zodResolver(createPortefeuilleSchema),
    defaultValues: { proprietaireType: 'USER' },
  });

  const proprietaireType = watch('proprietaireType');
  const selectedGestionnaire = watch('gestionnaireId') ?? '';

  const onSubmit = handleSubmit((values) => {
    create.mutate(
      {
        ...values,
        caisseSourceId: caisseId,
        deviseId,
        gestionnaireId: values.gestionnaireId || undefined,
        soldeInitial: values.soldeInitial || undefined,
      },
      {
        onSuccess: () => onDone(),
      },
    );
  });

  return (
    <div className="mb-2 rounded-md border border-[rgba(15,76,129,0.15)] bg-white p-3">
      <div className="mb-2 text-xs font-semibold text-[#475569]">Nouveau portefeuille</div>
      <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="pf-code">Code</Label>
          <Input id="pf-code" {...register('code')} />
          {errors.code && <p className="text-xs text-destructive">{errors.code.message}</p>}
        </div>
        <div className="space-y-1">
          <Label htmlFor="pf-libelle">Libellé</Label>
          <Input id="pf-libelle" {...register('libelle')} />
          {errors.libelle && <p className="text-xs text-destructive">{errors.libelle.message}</p>}
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label>Propriétaire</Label>
          <div className="flex gap-2">
            <select
              className={selectClass}
              {...register('proprietaireType')}
              onChange={(e) => {
                setValue('proprietaireType', e.target.value as 'USER' | 'DIRECTION');
                setValue('proprietaireId', '');
              }}
            >
              <option value="USER">Utilisateur</option>
              <option value="DIRECTION">Direction</option>
            </select>
            <select className={selectClass} {...register('proprietaireId')}>
              <option value="">— Choisir —</option>
              {proprietaireType === 'USER'
                ? users?.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.prenom} {u.nom}
                    </option>
                  ))
                : directions?.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.code} — {d.libelle}
                    </option>
                  ))}
            </select>
          </div>
          {errors.proprietaireId && <p className="text-xs text-destructive">{errors.proprietaireId.message}</p>}
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="pf-gest" className="flex items-center gap-1.5">
            <UserCog className="h-3.5 w-3.5 text-[#1A6DB5]" />
            Gestionnaire <span className="text-xs font-normal text-[#64748B]">(optionnel)</span>
          </Label>
          <select id="pf-gest" className={selectClass} {...register('gestionnaireId')}>
            <option value="">— Aucun gestionnaire —</option>
            {users?.map((u) => (
              <option key={u.id} value={u.id}>
                {u.prenom} {u.nom} (#{u.matricule})
              </option>
            ))}
          </select>
          <GestionnaireRoleWarning userId={selectedGestionnaire} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="pf-solde">Solde initial (optionnel)</Label>
          <Input id="pf-solde" inputMode="decimal" placeholder="0" {...register('soldeInitial')} />
        </div>
        <div className="flex items-end gap-2">
          <Button type="submit" disabled={create.isPending} size="sm">
            {create.isPending ? 'Création…' : 'Créer'}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onDone}>
            Annuler
          </Button>
        </div>
        {create.isError && (
          <p className="sm:col-span-2 text-xs text-destructive">{apiErrorMessage(create.error, 'Création impossible')}</p>
        )}
      </form>
    </div>
  );
}

// ============================================================
// MODAL OVERLAY (utilitaire)
// ============================================================
function ModalOverlay({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-[13px] border border-[rgba(15,76,129,0.1)] bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-[rgba(15,76,129,0.07)] px-5 py-3">
          <div className="font-display text-sm font-semibold text-[#0F172A]">{title}</div>
          <button
            type="button"
            aria-label="Fermer"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-[7px] text-[#94A3B8] hover:bg-[#F8FAFC] hover:text-[#0F172A]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// ============================================================
// CELLULES SOLDE
// ============================================================
function WalletCard({
  pf,
  deviseCode,
  color,
  onEdit,
  onDelete,
  deleteBusy,
}: {
  pf: Portefeuille;
  deviseCode: string;
  color: string;
  onEdit: () => void;
  onDelete: () => void;
  deleteBusy?: boolean;
}) {
  const { data } = usePortefeuilleSolde(pf.id);
  const { data: users } = useUsers();
  const toggleActive = useTogglePortefeuilleActive();
  const fp = useFinancePerms();
  const gestionnaire = pf.gestionnaireId ? users?.find((u) => u.id === pf.gestionnaireId) : undefined;
  const isInactive = pf.estActif === false;
  const busy = deleteBusy || (toggleActive.isPending && toggleActive.variables?.id === pf.id);
  const [confirmToggleOpen, setConfirmToggleOpen] = useState(false);

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-[13px] p-[18px] text-white',
        isInactive ? 'bg-gradient-to-br from-[#475569] to-[#1E293B] opacity-70 grayscale' : color,
      )}
    >
      <ConfirmDialog
        open={confirmToggleOpen}
        variant={isInactive ? 'success' : 'warning'}
        icon={isInactive ? Power : PowerOff}
        title={isInactive ? `Activer le portefeuille ${pf.code} ?` : `Désactiver le portefeuille ${pf.code} ?`}
        description={
          isInactive
            ? `« ${pf.libelle} » redeviendra utilisable pour la création de bons et les opérations.`
            : `« ${pf.libelle} » ne sera plus disponible pour de nouvelles opérations tant qu'il n'est pas réactivé.`
        }
        confirmLabel={isInactive ? 'Activer' : 'Désactiver'}
        busy={toggleActive.isPending}
        onCancel={() => setConfirmToggleOpen(false)}
        onConfirm={() => {
          toggleActive.mutate(
            { id: pf.id, estActif: !pf.estActif },
            { onSettled: () => setConfirmToggleOpen(false) },
          );
        }}
      />
      <div className="absolute -right-5 -top-5 h-20 w-20 rounded-full bg-white/[0.06]" />
      <div className="absolute -bottom-8 right-2.5 h-[100px] w-[100px] rounded-full bg-white/[0.04]" />
      <Wallet className="absolute bottom-4 right-4 h-7 w-7 text-white/15" />
      <div className="relative flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <span className="truncate text-[10px] font-semibold uppercase tracking-[0.7px] text-white/60">
              {pf.libelle}
            </span>
            {isInactive && (
              <span className="rounded-full bg-[#FEF3F2] px-1.5 py-0.5 text-[9px] font-semibold text-[#B42318]">
                Désactivé
              </span>
            )}
          </div>
          <div className="font-display text-[22px] font-bold leading-none">
            {data ? formatMontant(data.solde) : '…'}
          </div>
          <div className="mt-1 text-[11px] text-white/50">
            {deviseCode} · {pf.code} · {pf.proprietaireType === 'USER' ? 'Utilisateur' : 'Direction'}
          </div>
          {gestionnaire && (
            <div
              className="mt-2 inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-medium text-white/90"
              title={`Gestionnaire : ${gestionnaire.prenom} ${gestionnaire.nom}`}
            >
              <UserCog className="h-2.5 w-2.5" />
              {gestionnaire.prenom} {gestionnaire.nom}
            </div>
          )}
        </div>
        <div className="flex shrink-0 gap-1">
          {fp.canManagePf && (
            <button
              type="button"
              aria-label={isInactive ? 'Activer' : 'Désactiver'}
              title={isInactive ? 'Activer le portefeuille' : 'Désactiver le portefeuille'}
              disabled={busy}
              onClick={() => setConfirmToggleOpen(true)}
              className={cn(
                'flex h-6 w-6 items-center justify-center rounded-md transition-colors disabled:opacity-50',
                isInactive
                  ? 'bg-[#00C896]/20 text-[#00C896] hover:bg-[#00C896]/40'
                  : 'bg-white/10 text-white hover:bg-[#F59E0B]/40',
              )}
            >
              {isInactive ? <Power className="h-3 w-3" /> : <PowerOff className="h-3 w-3" />}
            </button>
          )}
          {fp.canManagePf && (
            <button
              type="button"
              aria-label="Modifier"
              onClick={onEdit}
              className="flex h-6 w-6 items-center justify-center rounded-md bg-white/10 text-white transition-colors hover:bg-white/20"
            >
              <Pencil className="h-3 w-3" />
            </button>
          )}
          {fp.canDeletePf && (
            <button
              type="button"
              aria-label="Supprimer"
              disabled={deleteBusy}
              onClick={onDelete}
              className="flex h-6 w-6 items-center justify-center rounded-md bg-white/10 text-white transition-colors hover:bg-red-500/40 disabled:opacity-50"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// SECTION PORTEFEUILLES (dépliée sous une caisse)
// ============================================================
function PortefeuillesSection({ caisseId, deviseId }: { caisseId: string; deviseId: string }) {
  const { data: portefeuilles, isLoading } = usePortefeuilles(caisseId);
  const { data: devises } = useDevises();
  const remove = useDeletePortefeuille();
  const fp = useFinancePerms();
  const [showCreate, setShowCreate] = useState(false);
  const [editPf, setEditPf] = useState<Portefeuille | null>(null);
  const [pfToDelete, setPfToDelete] = useState<Portefeuille | null>(null);

  const deviseCode = devises?.find((d) => d.id === deviseId)?.code ?? '';

  return (
    <div className="p-[18px]">
      {editPf && <EditPortefeuilleModal portefeuille={editPf} onClose={() => setEditPf(null)} />}

      <ConfirmDialog
        open={pfToDelete !== null}
        variant="danger"
        title={pfToDelete ? `Supprimer le portefeuille ${pfToDelete.code} ?` : ''}
        description="Cette action est irréversible. Le portefeuille sera retiré de la liste."
        confirmLabel="Supprimer"
        busy={remove.isPending}
        onCancel={() => setPfToDelete(null)}
        onConfirm={() => {
          if (!pfToDelete) return;
          remove.mutate(pfToDelete.id, { onSettled: () => setPfToDelete(null) });
        }}
      />

      {!showCreate && fp.canManagePf && (
        <div className="mb-3 flex justify-end">
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 rounded-[9px] bg-[#0F4C81] px-3.5 py-1.5 text-[11px] font-medium text-white transition hover:bg-[#1A6DB5]"
          >
            <Plus className="h-4 w-4" /> Nouveau portefeuille
          </button>
        </div>
      )}

      {showCreate && (
        <NewPortefeuilleInline
          caisseId={caisseId}
          deviseId={deviseId}
          onDone={() => setShowCreate(false)}
        />
      )}

      {isLoading && <div className="text-xs text-[#64748B]">Chargement…</div>}

      {portefeuilles && portefeuilles.length === 0 && !showCreate && (
        <div className="rounded-md border border-dashed border-[rgba(15,76,129,0.15)] bg-white p-4 text-center text-xs text-[#94A3B8]">
          Aucun portefeuille rattaché à cette caisse.
        </div>
      )}

      {portefeuilles && portefeuilles.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {portefeuilles.map((pf) => (
            <WalletCard
              key={pf.id}
              pf={pf}
              deviseCode={deviseCode}
              color="bg-gradient-to-br from-[#0F4C81] to-[#1A6DB5]"
              onEdit={() => setEditPf(pf)}
              onDelete={() => setPfToDelete(pf)}
              deleteBusy={remove.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// CARTE CAISSE (cliquable pour sélectionner)
// ============================================================
function CaisseCard({
  caisse,
  selected,
  onSelect,
  onEdit,
}: {
  caisse: Caisse;
  selected: boolean;
  onSelect: () => void;
  onEdit: () => void;
}) {
  const { data: solde } = useCaisseSolde(caisse.id);
  const { data: devises } = useDevises();
  const devise = devises?.find((d) => String(d.id) === String(caisse.deviseId));
  const deviseCode = devise?.code ?? '';
  const open = useOpenCaisse();
  const close = useCloseCaisse();
  const del = useDeleteCaisse();
  const toggleActive = useToggleCaisseActive();
  const busy =
    (open.isPending && open.variables?.id === caisse.id) ||
    (close.isPending && close.variables?.id === caisse.id) ||
    (del.isPending && del.variables === caisse.id) ||
    (toggleActive.isPending && toggleActive.variables?.id === caisse.id);

  const fp = useFinancePerms();
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  const isInactive = caisse.estActif === false;
  const [confirmToggleOpen, setConfirmToggleOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'relative block w-full overflow-hidden rounded-[13px] p-5 text-left text-white transition-all',
        isInactive
          ? 'bg-gradient-to-br from-[#475569] to-[#1E293B] opacity-70 grayscale'
          : 'bg-gradient-to-br from-[#065F46] via-[#047857] to-[#10B981]',
        selected ? 'ring-2 ring-[#0F4C81] ring-offset-2 ring-offset-[#F1F5F9]' : '',
      )}
    >
      <span onClick={stop}>
        <ConfirmDialog
          open={confirmToggleOpen}
          variant={isInactive ? 'success' : 'warning'}
          icon={isInactive ? Power : PowerOff}
          title={isInactive ? `Activer la caisse ${caisse.code} ?` : `Désactiver la caisse ${caisse.code} ?`}
          description={
            isInactive
              ? `« ${caisse.libelle} » redeviendra utilisable pour les opérations.`
              : `« ${caisse.libelle} » ne pourra plus être utilisée tant qu'elle n'est pas réactivée. La désactivation est refusée si une session est OUVERTE.`
          }
          confirmLabel={isInactive ? 'Activer' : 'Désactiver'}
          busy={toggleActive.isPending}
          error={toggleActive.isError ? apiErrorMessage(toggleActive.error, 'Action impossible') : undefined}
          onCancel={() => {
            setConfirmToggleOpen(false);
            toggleActive.reset();
          }}
          onConfirm={() => {
            toggleActive.mutate(
              { id: caisse.id, estActif: !caisse.estActif },
              { onSuccess: () => setConfirmToggleOpen(false) },
            );
          }}
        />
        <ConfirmDialog
          open={confirmDeleteOpen}
          variant="danger"
          title={`Supprimer la caisse ${caisse.code} ?`}
          description={`« ${caisse.libelle} » sera retirée de la liste. Cette action est irréversible.`}
          confirmLabel="Supprimer"
          busy={del.isPending}
          onCancel={() => setConfirmDeleteOpen(false)}
          onConfirm={() => del.mutate(caisse.id, { onSettled: () => setConfirmDeleteOpen(false) })}
        />
      </span>
      {/* décors */}
      <div className="pointer-events-none absolute -right-5 -top-5 h-24 w-24 rounded-full bg-white/[0.06]" />
      <div className="pointer-events-none absolute -bottom-10 right-2.5 h-[120px] w-[120px] rounded-full bg-white/[0.04]" />
      <Landmark className="pointer-events-none absolute bottom-4 right-4 h-9 w-9 text-white/15" />

      <div className="relative">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="mb-1 truncate text-[11px] font-semibold uppercase tracking-[0.7px] text-white/60">
              {caisse.libelle}
            </div>
            <div className="truncate text-[11px] text-white/50">
              {caisse.code}
              {deviseCode ? ` · ${deviseCode}` : ''}
              {caisse.estPrincipale ? ' · principale' : ''}
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            {caisse.statut === 'OUVERTE' ? (
              <span className="rounded-full bg-[#00C896]/30 px-2 py-0.5 text-[10px] font-semibold text-white">
                Ouverte
              </span>
            ) : (
              <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold text-white/80">
                Fermée
              </span>
            )}
            {isInactive && (
              <span className="rounded-full bg-[#FEF3F2] px-2 py-0.5 text-[10px] font-semibold text-[#B42318]">
                Désactivée
              </span>
            )}
          </div>
        </div>

        <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.7px] text-white/50">Solde</div>
        <div className="font-display text-[26px] font-bold leading-none">
          {solde ? formatMontant(solde.solde) : '…'}
          {deviseCode && <span className="ml-1.5 text-[13px] font-semibold text-white/70">{deviseCode}</span>}
        </div>

        <div className="mt-4 flex items-center gap-2" onClick={stop}>
          {fp.canOpenClose &&
            (caisse.statut === 'FERMEE' ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => open.mutate({ id: caisse.id })}
                className="rounded-md bg-white px-3 py-1 text-[11px] font-semibold text-[#047857] transition-colors hover:bg-[#ECFDF5] disabled:opacity-50"
              >
                Ouvrir
              </button>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => close.mutate({ id: caisse.id })}
                className="rounded-md bg-white/10 px-3 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-white/20 disabled:opacity-50"
              >
                Clôturer
              </button>
            ))}
          <div className="ml-auto flex gap-1">
            {fp.canManageCaisse && (
              <button
                type="button"
                aria-label={isInactive ? 'Activer' : 'Désactiver'}
                title={isInactive ? 'Activer la caisse' : 'Désactiver la caisse'}
                disabled={busy}
                onClick={() => setConfirmToggleOpen(true)}
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-md transition-colors disabled:opacity-50',
                  isInactive
                    ? 'bg-[#00C896]/20 text-[#00C896] hover:bg-[#00C896]/40'
                    : 'bg-white/10 text-white hover:bg-[#F59E0B]/40',
                )}
              >
                {isInactive ? <Power className="h-3.5 w-3.5" /> : <PowerOff className="h-3.5 w-3.5" />}
              </button>
            )}
            {fp.canManageCaisse && (
              <button
                type="button"
                aria-label="Modifier"
                onClick={onEdit}
                className="flex h-7 w-7 items-center justify-center rounded-md bg-white/10 text-white transition-colors hover:bg-white/20"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
            {fp.canDeleteCaisse && (
              <button
                type="button"
                aria-label="Supprimer"
                disabled={busy}
                onClick={() => setConfirmDeleteOpen(true)}
                className="flex h-7 w-7 items-center justify-center rounded-md bg-white/10 text-white transition-colors hover:bg-red-500/40 disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

// ============================================================
// PAGE
// ============================================================
export function CaissesPage() {
  const { data: caisses, isLoading, isError } = useCaisses();
  const fp = useFinancePerms();
  const [showCreate, setShowCreate] = useState(false);
  const [editCaisse, setEditCaisse] = useState<Caisse | null>(null);

  const openCount = caisses?.filter((c) => c.statut === 'OUVERTE').length ?? 0;

  // Ordre STABLE par identifiant (immuable) : modifier un champ d'une caisse
  // ne la fait jamais « passer en bas », quel que soit le champ édité.
  const orderedCaisses = [...(caisses ?? [])].sort((a, b) => Number(a.id) - Number(b.id));

  return (
    <div className="flex flex-col gap-4">
      {editCaisse && <EditCaisseModal caisse={editCaisse} onClose={() => setEditCaisse(null)} />}

      {/* Bannière si aucune caisse ouverte */}
      {caisses && openCount === 0 && (
        <div className="flex items-center gap-4 rounded-[13px] bg-gradient-to-br from-[#065F46] to-[#10B981] p-5 text-white">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/10">
            <Landmark className="h-6 w-6" />
          </div>
          <div>
            <div className="text-[13px] font-semibold">Aucune caisse ouverte</div>
            <div className="text-[11px] text-white/70">
              {caisses.length === 0
                ? 'Créez une caisse pour commencer les opérations.'
                : 'Ouvrez une caisse depuis la liste pour démarrer les opérations.'}
            </div>
          </div>
          {!showCreate && fp.canManageCaisse && (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="ml-auto flex items-center gap-1.5 rounded-[9px] bg-white px-4 py-2 text-[11px] font-semibold text-[#047857] transition hover:bg-[#ECFDF5]"
            >
              <Plus className="h-4 w-4" /> Nouvelle caisse
            </button>
          )}
        </div>
      )}

      {showCreate && <CreateCaisseModal onClose={() => setShowCreate(false)} />}

      {/* Barre d'en-tête */}
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="font-display text-sm font-semibold text-[#0F172A]">Caisses</span>
        <span className="rounded-full bg-[#ECFDF5] px-2 py-0.5 text-[10px] font-semibold text-[#047857]">
          {caisses?.length ?? 0}
        </span>
        {!showCreate && fp.canManageCaisse && (
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="ml-auto flex items-center gap-1.5 rounded-[9px] bg-[#047857] px-3.5 py-1.5 text-[11px] font-medium text-white transition hover:bg-[#059669]"
          >
            <Plus className="h-4 w-4" /> Nouvelle caisse
          </button>
        )}
      </div>

      {isLoading && <div className="px-[18px] py-8 text-sm text-[#64748B]">Chargement…</div>}
      {isError && <div className="px-[18px] py-8 text-sm text-[#EF4444]">Impossible de charger les caisses.</div>}

      {caisses && caisses.length === 0 && (
        <Panel>
          <div className="px-[18px] py-10 text-center text-sm text-[#64748B]">
            <div className="mb-2 text-2xl opacity-25">🏦</div>
            Aucune caisse enregistrée. Créez-en une pour commencer.
          </div>
        </Panel>
      )}

      {/* Une LIGNE par caisse : la caisse (verte) à gauche, SES portefeuilles (bleus)
          à droite, le tout dans la MÊME div. Tout est affiché d'emblée. */}
      {orderedCaisses.map((caisse) => (
        <div
          key={caisse.id}
          className="grid items-start gap-3 rounded-[16px] border border-[rgba(15,76,129,0.12)] bg-white p-3 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]"
        >
          <CaisseCard
            caisse={caisse}
            selected={false}
            onSelect={() => {}}
            onEdit={() => setEditCaisse(caisse)}
          />
          <PortefeuillesSection caisseId={caisse.id} deviseId={caisse.deviseId} />
        </div>
      ))}
    </div>
  );
}
