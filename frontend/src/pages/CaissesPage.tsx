import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertTriangle, Landmark, Pencil, Plus, Power, PowerOff, Trash2, UserCog, Wallet, X } from 'lucide-react';
import {
  useCaisses,
  useCaisseSolde,
  useCaisseSoldeConsolide,
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

/**
 * Droits de gestion caisses/portefeuilles de l'utilisateur connecté.
 * Gouvernance : STRICTEMENT par permission — AUCUN bypass admin. Un admin doit
 * avoir la permission attribuée (cf. migration 0031 qui les donne aux profils admin).
 */
function useFinancePerms() {
  const user = useAuthStore((s) => s.user);
  const { data: perms } = useMyPermissions(user?.id ?? null);
  const p = new Set(perms ?? []);
  return {
    canManageCaisse: p.has('CAISSE_MODIFIER'),
    canDeleteCaisse: p.has('CAISSE_SUPPRIMER'),
    canManagePf: p.has('PORTEFEUILLE_MODIFIER'),
    canDeletePf: p.has('PORTEFEUILLE_SUPPRIMER'),
    canEditSoldeInitial: p.has('PORTEFEUILLE_SOLDE_INITIAL'),
    canOpen: p.has('CAISSE_OUVRIR'),
    canClose: p.has('CAISSE_CLOTURER'),
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
  code: z.string().trim().min(1, 'Requis'),
  libelle: z.string().trim().min(1, 'Requis'),
  deviseId: z.string().trim().min(1, 'Devise requise'),
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
  code: z.string().trim().min(1),
  libelle: z.string().trim().min(1),
  deviseId: z.string().trim().min(1),
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
  code: z.string().trim().min(1),
  libelle: z.string().trim().min(1),
  gestionnaireId: z.string().optional(),
  soldeInitial: z
    .string()
    .optional()
    .refine((v) => !v || /^\d+(\.\d{1,4})?$/.test(v), 'Montant invalide'),
  budgetMensuel: z
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
  const fp = useFinancePerms();
  // Le solde initial est verrouillé si : (a) l'utilisateur n'a pas la permission
  // dédiée, ou (b) le portefeuille a déjà de l'activité (solde ≠ solde initial),
  // auquel cas le backend refuse la modification (intégrité de l'historique).
  const { data: soldeDetail } = usePortefeuilleSolde(portefeuille.id);
  const aDesEcritures = !!soldeDetail && Number(soldeDetail.solde) !== Number(soldeDetail.soldeInitial);
  const soldeLocked = !fp.canEditSoldeInitial || aDesEcritures;
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
      budgetMensuel: portefeuille.budgetMensuel != null ? String(portefeuille.budgetMensuel) : '',
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
          budgetMensuel: values.budgetMensuel || undefined,
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

        {/* Un portefeuille de DIRECTION n'a pas de solde initial saisissable :
            il est alimenté à son plafond au début de chaque mois, et tout
            excédent repart en caisse au réajustement. */}
        <div className="space-y-1.5">
          <Label htmlFor="pf-edit-solde">Solde initial</Label>
          {portefeuille.proprietaireType === 'DIRECTION' ? (
            <>
              <Input id="pf-edit-solde" disabled readOnly value="" placeholder="Non applicable" />
              <p className="text-[11px] text-[#B45309]">
                Sans objet pour un portefeuille de direction : il est alimenté chaque mois à
                hauteur du budget du centre de coût.
              </p>
            </>
          ) : (
            <>
              <Input
                id="pf-edit-solde"
                inputMode="decimal"
                placeholder="0"
                disabled={soldeLocked}
                {...register('soldeInitial')}
              />
              {soldeLocked && (
                <p className="text-[11px] text-[#B45309]">
                  {!fp.canEditSoldeInitial
                    ? 'Modification réservée aux administrateurs (permission dédiée).'
                    : 'Verrouillé : des écritures existent sur ce portefeuille — passez par un ajustement.'}
                </p>
              )}
              {errors.soldeInitial && (
                <p className="text-sm text-destructive">{errors.soldeInitial.message}</p>
              )}
            </>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="pf-edit-budget">
            Budget mensuel{' '}
            {portefeuille.proprietaireType === 'USER' && (
              <span className="text-xs font-normal text-[#64748B]">(optionnel)</span>
            )}
          </Label>
          {portefeuille.proprietaireType === 'DIRECTION' ? (
            <>
              <Input
                id="pf-edit-budget"
                disabled
                value={portefeuille.budgetMensuel != null ? String(portefeuille.budgetMensuel) : ''}
                placeholder="Hérité du centre de coût"
                readOnly
              />
              <p className="text-[11px] text-[#B45309]">
                Hérité du budget mensuel du centre de coût de la direction — non modifiable ici. Pour le changer,
                éditez le centre de coût de la direction.
              </p>
            </>
          ) : (
            <>
              <Input id="pf-edit-budget" inputMode="decimal" placeholder="Plafond / mois" {...register('budgetMensuel')} />
              {errors.budgetMensuel && <p className="text-sm text-destructive">{errors.budgetMensuel.message}</p>}
            </>
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
  code: z.string().trim().min(1, 'Requis'),
  libelle: z.string().trim().min(1, 'Requis'),
  proprietaireType: z.enum(['USER', 'DIRECTION']),
  proprietaireId: z.string().trim().min(1, 'Propriétaire requis'),
  gestionnaireId: z.string().optional(),
  deviseId: z.string().trim().min(1, 'Devise requise'),
  soldeInitial: z.string().optional(),
  budgetMensuel: z
    .string()
    .optional()
    .refine((v) => !v || /^\d+(\.\d{1,4})?$/.test(v), 'Montant invalide'),
});
type CreatePortefeuilleFormValues = z.infer<typeof createPortefeuilleSchema>;

function NewPortefeuilleModal({
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
  const { data: devises } = useDevises();
  const create = useCreatePortefeuille();
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CreatePortefeuilleFormValues>({
    resolver: zodResolver(createPortefeuilleSchema),
    // La devise de la caisse n'est qu'une proposition : c'est le portefeuille
    // qui porte la sienne, et une caisse peut en détenir plusieurs.
    defaultValues: { proprietaireType: 'USER', deviseId },
  });

  const proprietaireType = watch('proprietaireType');
  const selectedGestionnaire = watch('gestionnaireId') ?? '';
  const selectedDevise = watch('deviseId') ?? '';

  const onSubmit = handleSubmit((values) => {
    create.mutate(
      {
        ...values,
        caisseSourceId: caisseId,
        gestionnaireId: values.gestionnaireId || undefined,
        soldeInitial: values.soldeInitial || undefined,
        budgetMensuel: values.budgetMensuel || undefined,
      },
      {
        onSuccess: () => onDone(),
      },
    );
  });

  return (
    <ModalOverlay title="Nouveau portefeuille" onClose={onDone}>
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
          <Label htmlFor="pf-devise">Devise</Label>
          <select id="pf-devise" className={selectClass} {...register('deviseId')}>
            <option value="">— Choisir —</option>
            {devises?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.code} — {d.libelle}
              </option>
            ))}
          </select>
          {selectedDevise && selectedDevise !== deviseId && (
            <p className="text-xs text-[#B45309]">
              Devise différente de la caisse : celle-ci devra détenir des {devises?.find((d) => d.id === selectedDevise)?.code} pour
              pouvoir recharger ce portefeuille.
            </p>
          )}
          {errors.deviseId && <p className="text-xs text-destructive">{errors.deviseId.message}</p>}
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
        {/* Portefeuille de DIRECTION : ni solde initial ni budget ne se
            saisissent. Les deux viennent du centre de coût, et un solde initial
            posé à la main était REPRIS dès le passage du réajustement mensuel —
            un portefeuille créé à 1 000 milliards face à un plafond de 1
            milliard s'est vu retirer 999 milliards, renvoyés en caisse. Le
            champ ne promettait donc rien de tenable. */}
        {proprietaireType === 'DIRECTION' ? (
          <div className="space-y-1 sm:col-span-2">
            <Label>Solde initial et budget mensuel</Label>
            <Input disabled placeholder="Hérités du centre de coût de la direction" />
            <p className="text-[11px] text-[#94A3B8]">
              Le plafond vient du budget mensuel du centre de coût, et le portefeuille est
              alimenté à ce plafond au début de chaque mois. Saisir un solde initial ici serait
              sans effet : l'excédent repartirait en caisse au premier réajustement.
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-1">
              <Label htmlFor="pf-solde">Solde initial (optionnel)</Label>
              <Input id="pf-solde" inputMode="decimal" placeholder="0" {...register('soldeInitial')} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pf-budget">Budget mensuel (optionnel)</Label>
              <Input id="pf-budget" inputMode="decimal" placeholder="Plafond / mois" {...register('budgetMensuel')} />
              {errors.budgetMensuel && <p className="text-xs text-destructive">{errors.budgetMensuel.message}</p>}
            </div>
          </>
        )}
        <div className="flex items-center gap-2 sm:col-span-2">
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? 'Création…' : 'Créer'}
          </Button>
          <Button type="button" variant="ghost" onClick={onDone}>
            Annuler
          </Button>
          {create.isError && (
            <p className="text-sm text-destructive">{apiErrorMessage(create.error, 'Création impossible')}</p>
          )}
        </div>
      </form>
    </ModalOverlay>
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
    // Clic sur le fond = fermeture ; l'arrêt de propagation évite qu'un clic
    // dans le formulaire ne referme la modale.
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-[13px] border border-[rgba(15,76,129,0.1)] bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
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
        {/* Le corps défile seul : l'en-tête et sa fermeture restent visibles
            même sur un formulaire long ou un petit écran. */}
        <div className="max-h-[75vh] overflow-y-auto p-5">{children}</div>
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
  const { data: directions } = useDirections();
  const toggleActive = useTogglePortefeuilleActive();
  const fp = useFinancePerms();
  const gestionnaire = pf.gestionnaireId ? users?.find((u) => u.id === pf.gestionnaireId) : undefined;

  // La carte n'annonçait que la NATURE du propriétaire (« Direction »), jamais
  // laquelle : six portefeuilles de direction se ressemblaient tous. On nomme
  // le propriétaire, et on retombe sur le mot générique si le référentiel n'est
  // pas encore chargé ou si l'entité a disparu.
  const proprietaire = (() => {
    if (pf.proprietaireType === 'DIRECTION') {
      const d = directions?.find((x) => String(x.id) === String(pf.proprietaireId));
      return d ? `Direction ${d.code}` : 'Direction';
    }
    const u = users?.find((x) => String(x.id) === String(pf.proprietaireId));
    return u ? `${u.prenom} ${u.nom}` : 'Utilisateur';
  })();
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
            {deviseCode} · {pf.code} · {proprietaire}
          </div>
          {/* Sans gestionnaire, la pastille disparaissait : on ne pouvait pas
              distinguer « personne n'est désigné » de « l'information n'est pas
              affichée ». L'absence est une information — elle se dit. */}
          {gestionnaire ? (
            <div
              className="mt-2 inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-medium text-white/90"
              title={`Gestionnaire : ${gestionnaire.prenom} ${gestionnaire.nom}`}
            >
              <UserCog className="h-2.5 w-2.5" />
              Géré par {gestionnaire.prenom} {gestionnaire.nom}
            </div>
          ) : (
            <div
              className="mt-2 inline-flex items-center gap-1 rounded-full border border-dashed border-white/30 px-2 py-0.5 text-[10px] font-medium text-white/60"
              title="Aucun gestionnaire n’est désigné pour ce portefeuille."
            >
              <UserCog className="h-2.5 w-2.5" />
              Aucun gestionnaire
            </div>
          )}

          {/* Réajustement manqué : la raison s'affiche ICI, sur la carte, à côté
              du solde qu'elle explique. Elle ne vivait que dans le journal du
              serveur — on voyait un portefeuille à 0 face à un budget d'un
              milliard, sans un mot, et l'on redémarrait le backend en vain. */}
          {pf.budgetResetErreur && (
            <div className="mt-2 rounded-[8px] bg-[#7F1D1D]/60 px-2 py-1.5 text-[10px] leading-snug text-white">
              <div className="flex items-center gap-1 font-semibold">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                Alimentation mensuelle en échec
              </div>
              <div className="mt-0.5 text-white/85">{pf.budgetResetErreur}</div>
              <div className="mt-0.5 text-white/60">Nouvelle tentative automatique dans l'heure.</div>
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
        error={remove.isError ? apiErrorMessage(remove.error, 'Suppression impossible') : undefined}
        onCancel={() => {
          remove.reset();
          setPfToDelete(null);
        }}
        onConfirm={() => {
          if (!pfToDelete) return;
          remove.mutate(pfToDelete.id, { onSuccess: () => setPfToDelete(null) });
        }}
      />

      {fp.canManagePf && (
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
        <NewPortefeuilleModal
          caisseId={caisseId}
          deviseId={deviseId}
          onDone={() => setShowCreate(false)}
        />
      )}

      {isLoading && <div className="text-xs text-[#64748B]">Chargement…</div>}

      {portefeuilles && portefeuilles.length === 0 && (
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
  // Devises autres que celle de la caisse, et non nulles : les masquer donnerait
  // une image fausse de ce que le coffre contient réellement.
  const autresDevises = (solde?.soldes ?? []).filter((d) => !d.principale && Number(d.solde) !== 0);
  // Le total converti n'a de sens qu'en présence de plusieurs devises : on ne le
  // demande donc au serveur que dans ce cas.
  const { data: consolide } = useCaisseSoldeConsolide(caisse.id, autresDevises.length > 0);
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
          error={del.isError ? apiErrorMessage(del.error, 'Suppression impossible') : undefined}
          onCancel={() => {
            del.reset();
            setConfirmDeleteOpen(false);
          }}
          onConfirm={() => del.mutate(caisse.id, { onSuccess: () => setConfirmDeleteOpen(false) })}
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

        {/* Autres devises détenues par la caisse. On ne les additionne pas au
            solde ci-dessus : ce sont des monnaies différentes. */}
        {autresDevises.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {autresDevises.map((d) => (
              <span
                key={d.deviseId}
                className="rounded-md bg-white/10 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white/80"
                title={`Cette caisse détient aussi ${formatMontant(d.solde)} ${d.code ?? ''}`}
              >
                {formatMontant(d.solde)}
                <span className="ml-1 text-white/55">{d.code ?? '—'}</span>
              </span>
            ))}
          </div>
        )}

        {/* Total INDICATIF, uniquement quand la caisse détient plusieurs devises :
            sur une caisse mono-devise il répéterait le solde ci-dessus. */}
        {autresDevises.length > 0 && consolide && (
          <div className="mt-2 text-[11px] text-white/70">
            ≈{' '}
            <span className="font-semibold tabular-nums text-white/90">
              {formatMontant(consolide.consolidation.total)} {consolide.consolidation.devise}
            </span>{' '}
            au total
            {consolide.consolidation.perime && (
              <span title="Un des taux employés n'a pas été rafraîchi depuis longtemps"> · taux ancien</span>
            )}
            {consolide.consolidation.ignorees.length > 0 && (
              <span
                title={consolide.consolidation.ignorees.map((i) => i.raison).join(' · ')}
              >
                {' '}· {consolide.consolidation.ignorees.length} devise(s) sans taux, hors total
              </span>
            )}
          </div>
        )}

        <div className="mt-4 flex items-center gap-2" onClick={stop}>
          {caisse.statut === 'FERMEE'
            ? fp.canOpen && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => open.mutate({ id: caisse.id })}
                  className="rounded-md bg-white px-3 py-1 text-[11px] font-semibold text-[#047857] transition-colors hover:bg-[#ECFDF5] disabled:opacity-50"
                >
                  Ouvrir
                </button>
              )
            : fp.canClose && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => close.mutate({ id: caisse.id })}
                  className="rounded-md bg-white/10 px-3 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-white/20 disabled:opacity-50"
                >
                  Clôturer
                </button>
              )}
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

  // Rafraîchissement « live » : tant qu'on est sur la page (et que l'onglet est
  // visible), on ré-interroge caisses, portefeuilles et leurs soldes toutes les
  // 10 s pour refléter en quasi temps réel les opérations faites ailleurs.
  const qc = useQueryClient();
  useEffect(() => {
    const LIVE_MS = 10_000;
    const tick = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      qc.invalidateQueries({ queryKey: ['caisses'] });
      qc.invalidateQueries({ queryKey: ['portefeuilles'] });
      qc.invalidateQueries({ queryKey: ['caisse'] }); // soldes de caisse : ['caisse', id, 'solde']
      qc.invalidateQueries({ queryKey: ['portefeuille'] }); // soldes de portefeuille : ['portefeuille', id, 'solde']
    };
    const t = setInterval(tick, LIVE_MS);
    return () => clearInterval(t);
  }, [qc]);

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
          {fp.canManageCaisse && (
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
        {fp.canManageCaisse && (
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
