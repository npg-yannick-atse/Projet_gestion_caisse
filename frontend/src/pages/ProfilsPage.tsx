import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Copy,
  KeyRound,
  Pencil,
  Plus,
  Trash2,
  User as UserIcon,
} from 'lucide-react';
import {
  useProfils,
  useProfilPermissions,
  useToggleProfilPermission,
  useCreateProfil,
  useUpdateProfil,
  useDeleteProfil,
} from '@/api/profils';
import { usePermissions } from '@/api/roles';
import type { Permission, Profil } from '@/types/api';
import { apiErrorMessage, cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { SortableHeader } from '@/components/SortableHeader';
import { useTableSort } from '@/hooks/useTableSort';
import { useClientSort } from '@/hooks/useClientSort';
import { RoleGuard } from '@/components/RoleGuard';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { GenererDepuisModal } from '@/components/GenererDepuisModal';
import { useGenererRoleDepuisProfil } from '@/api/roles';

const schema = z.object({
  code: z.string().trim().min(1, 'Requis'),
  libelle: z.string().trim().min(1, 'Requis'),
  description: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

/**
 * Un profil ne porte plus de catégorie : elle ne servait qu'à teinter cette
 * pastille et ne décidait de rien. Toutes les pastilles se ressemblent donc,
 * ce qui est honnête — rien ne distingue deux profils que leurs permissions.
 */
function ProfilBadge({ profil }: { profil: Profil }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#F8FAFC] px-3 py-1 text-[11px] font-semibold text-[#475569]">
      <UserIcon className="h-3.5 w-3.5" />
      {profil.libelle}
    </span>
  );
}

/** Formulaire de création (profil = null) ou d'édition d'un profil. */
function ProfilForm({ profil, onDone }: { profil: Profil | null; onDone: () => void }) {
  const create = useCreateProfil();
  const update = useUpdateProfil();
  const isEdit = !!profil;
  const pending = create.isPending || update.isPending;
  const error = create.error ?? update.error;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: profil
      ? {
          code: profil.code,
          libelle: profil.libelle,
          description: profil.description ?? '',
        }
      : { code: '', libelle: '', description: '' },
  });

  const onSubmit = handleSubmit((values) => {
    const payload = {
      code: values.code,
      libelle: values.libelle,
      description: values.description || undefined,
    };
    const onSuccess = () => {
      reset();
      onDone();
    };
    if (isEdit) {
      update.mutate({ id: profil!.id, payload }, { onSuccess });
    } else {
      create.mutate(payload, { onSuccess });
    }
  });

  return (
    <Panel>
      <PanelHeader title={isEdit ? `Modifier — ${profil!.libelle}` : 'Nouveau profil'} />
      <form onSubmit={onSubmit} className="grid gap-4 p-[18px] sm:grid-cols-2">
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
          <Label htmlFor="description">Description (optionnel)</Label>
          <Input id="description" {...register('description')} />
        </div>
        <div className="flex items-center gap-2 sm:col-span-2">
          <Button type="submit" disabled={pending}>
            {pending ? 'Enregistrement…' : isEdit ? 'Enregistrer' : 'Créer'}
          </Button>
          <Button type="button" variant="ghost" onClick={onDone}>
            Annuler
          </Button>
          {error && <p className="text-sm text-destructive">{apiErrorMessage(error, 'Enregistrement impossible')}</p>}
        </div>
      </form>
    </Panel>
  );
}

function ProfilRow({
  profil,
  selected,
  onPermissions,
  onEdit,
  onDelete,
}: {
  profil: Profil;
  selected: boolean;
  onPermissions: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { data: perms } = useProfilPermissions(profil.id);
  return (
    <tr className={cn('border-t border-[rgba(15,76,129,0.07)] hover:bg-[#FAFBFF]', selected && 'bg-[#FAFBFF]')}>
      <td className="px-4 py-3">
        <ProfilBadge profil={profil} />
      </td>
      <td className="px-4 py-3 text-center text-xs tabular-nums text-[#0F172A]">{perms?.length ?? '—'}</td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={onPermissions}
            title="Gérer les permissions"
            aria-label="Gérer les permissions"
            className={cn(
              'inline-flex h-7 w-7 items-center justify-center rounded-[7px] border border-[rgba(15,76,129,0.1)] bg-white text-[#475569] transition-colors hover:bg-[#EFF6FF] hover:text-[#1A6DB5]',
              selected && 'border-[#1A6DB5] bg-[#EFF6FF] text-[#1A6DB5]',
            )}
          >
            <KeyRound className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onEdit}
            title="Modifier le profil"
            aria-label="Modifier le profil"
            className="inline-flex h-7 w-7 items-center justify-center rounded-[7px] border border-[rgba(15,76,129,0.1)] bg-white text-[#475569] transition-colors hover:bg-[#EFF6FF] hover:text-[#1A6DB5]"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            title="Désactiver le profil"
            aria-label="Désactiver le profil"
            className="inline-flex h-7 w-7 items-center justify-center rounded-[7px] text-[#94A3B8] transition-colors hover:bg-[#FEF2F2] hover:text-[#EF4444]"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function PermissionRow({ permission, profilId, assigned }: { permission: Permission; profilId: string; assigned: boolean }) {
  const toggle = useToggleProfilPermission(profilId);
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-[7px] px-2 py-1.5 hover:bg-[#F8FAFC]">
      <input
        type="checkbox"
        checked={assigned}
        disabled={toggle.isPending}
        onChange={() => toggle.mutate({ permissionId: permission.id, assigned })}
        className="h-4 w-4"
      />
      <span className="flex-1 text-xs">
        <span className="font-medium text-[#0F172A]">{permission.libelle}</span>{' '}
        <span className="text-[10px] text-[#94A3B8]">({permission.code})</span>
      </span>
    </label>
  );
}

function PermissionEditor({ profil }: { profil: Profil }) {
  const { data: permissions } = usePermissions();
  const profilPerms = useProfilPermissions(profil.id);
  const assignedIds = useMemo(() => new Set((profilPerms.data ?? []).map((p) => p.id)), [profilPerms.data]);

  const byModule = useMemo(() => {
    const map = new Map<string, Permission[]>();
    for (const p of permissions ?? []) {
      const list = map.get(p.module) ?? [];
      list.push(p);
      map.set(p.module, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [permissions]);

  const [genererRole, setGenererRole] = useState(false);
  const generer = useGenererRoleDepuisProfil();

  return (
    <>
    {genererRole && (
      <GenererDepuisModal
        titre="Générer un rôle depuis ce profil"
        sourceLibelle={profil.libelle}
        nbPermissions={assignedIds.size}
        avertissement="Le rôle créé porte un code inédit : il n'ouvre AUCUN des pouvoirs que les sept rôles d'origine tiennent de leur code — voir les bons de tous, contourner les contrôles en administrateur, modifier un bon. C'est un paquet de permissions qui a la forme d'un rôle."
        pending={generer.isPending}
        error={generer.error}
        onValider={(code, libelle) =>
          generer.mutate({ profilId: profil.id, code, libelle }, { onSuccess: () => setGenererRole(false) })
        }
        onClose={() => setGenererRole(false)}
      />
    )}
    <Panel>
      <PanelHeader title={`Permissions — ${profil.libelle}`} badge={`${assignedIds.size}`}>
        {/* Symétrique du bouton de l'écran des rôles. */}
        <button
          type="button"
          onClick={() => setGenererRole(true)}
          className="ml-auto flex items-center gap-1.5 rounded-[9px] border border-[rgba(15,76,129,0.12)] bg-white px-3 py-1.5 text-[11px] font-medium text-[#0F4C81] transition hover:bg-[#EFF6FF]"
        >
          <Copy className="h-3.5 w-3.5" /> Générer un rôle
        </button>
      </PanelHeader>
      <div className="grid gap-5 p-[18px] sm:grid-cols-2">
        {byModule.map(([module, perms]) => (
          <div key={module} className="space-y-1">
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.7px] text-[#64748B]">{module}</h3>
            {perms.map((p) => (
              <PermissionRow key={p.id} permission={p} profilId={profil.id} assigned={assignedIds.has(p.id)} />
            ))}
          </div>
        ))}
        {byModule.length === 0 && <p className="text-sm text-[#64748B]">Aucune permission définie.</p>}
      </div>
    </Panel>
    </>
  );
}

const PROFIL_SORT_COLUMNS = ['libelle'] as const;
type ProfilSortCol = (typeof PROFIL_SORT_COLUMNS)[number];

function ProfilsPageInner() {
  const { data: profilsBruts, isLoading } = useProfils();
  // Tri à l'écran : la liste des profils tient sur une page.
  const sort = useTableSort<ProfilSortCol>('/profils', PROFIL_SORT_COLUMNS);
  const profils = useClientSort(profilsBruts, sort.state, {
    libelle: (p) => p.libelle,
  });
  const remove = useDeleteProfil();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // form: { mode: 'create' } | { mode: 'edit', profil } | null
  const [form, setForm] = useState<{ profil: Profil | null } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Profil | null>(null);
  const selected = profils?.find((p) => p.id === selectedId) ?? null;

  return (
    <div className="flex flex-col gap-4">
      {form && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center" onClick={() => setForm(null)}>
          <div className="w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <ProfilForm profil={form.profil} onDone={() => setForm(null)} />
          </div>
        </div>
      )}

      <Panel>
        <PanelHeader title="Gestion des profils" badge={`${profils?.length ?? 0}`}>
          {!form && (
            <button
              type="button"
              onClick={() => setForm({ profil: null })}
              className="ml-auto flex items-center gap-1.5 rounded-[9px] bg-[#0F4C81] px-3.5 py-1.5 text-[11px] font-medium text-white transition hover:bg-[#1A6DB5]"
            >
              <Plus className="h-4 w-4" /> Nouveau profil
            </button>
          )}
        </PanelHeader>

        {isLoading && <div className="px-[18px] py-8 text-sm text-[#64748B]">Chargement…</div>}

        {profils && (
          <table className="w-full text-xs">
            <thead className="bg-[#F8FAFC]">
              <tr className="text-[10px] uppercase tracking-[0.7px] text-[#64748B]">
                <SortableHeader column="libelle" state={sort.state} onSort={sort.setSort}>Profil</SortableHeader>
                <th className="px-4 py-2.5 text-center font-semibold">Permissions</th>
                <th className="px-4 py-2.5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {profils.map((profil) => (
                <ProfilRow
                  key={profil.id}
                  profil={profil}
                  selected={selectedId === profil.id}
                  onPermissions={() => setSelectedId((id) => (id === profil.id ? null : profil.id))}
                  onEdit={() => setForm({ profil })}
                  onDelete={() => setPendingDelete(profil)}
                />
              ))}
              {profils.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-[#64748B]">
                    Aucun profil. Cliquez sur « Nouveau profil » pour créer un paquet de permissions réutilisable.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </Panel>

      {selected ? (
        <PermissionEditor profil={selected} />
      ) : (
        <p className="px-1 text-xs text-[#64748B]">
          Icône <KeyRound className="inline h-3 w-3" /> = permissions · <Pencil className="inline h-3 w-3" /> = modifier ·{' '}
          <Trash2 className="inline h-3 w-3" /> = désactiver.
        </p>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        variant="warning"
        title={pendingDelete ? `Désactiver le profil ${pendingDelete.code} ?` : ''}
        description="Le profil ne sera plus assignable. Rien n'est supprimé définitivement."
        confirmLabel="Désactiver"
        busy={remove.isPending}
        error={remove.error ? apiErrorMessage(remove.error, 'Désactivation impossible') : undefined}
        onCancel={() => {
          setPendingDelete(null);
          remove.reset();
        }}
        onConfirm={() => {
          if (!pendingDelete) return;
          const id = pendingDelete.id;
          remove.mutate(id, {
            onSuccess: () => {
              if (selectedId === id) setSelectedId(null);
              setPendingDelete(null);
            },
          });
        }}
      />
    </div>
  );
}

export function ProfilsPage() {
  return (
    <RoleGuard allow={['SUPER_ADMIN', 'ADMINISTRATEUR']}>
      <ProfilsPageInner />
    </RoleGuard>
  );
}
