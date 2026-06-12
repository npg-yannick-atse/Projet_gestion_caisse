import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  BadgeCheck,
  Banknote,
  KeyRound,
  Pencil,
  Plus,
  Repeat,
  Trash2,
  User as UserIcon,
  type LucideIcon,
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
import type { Permission, Profil, ProfilCategorie } from '@/types/api';
import { apiErrorMessage, cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { RoleGuard } from '@/components/RoleGuard';

const CATEGORIES: ProfilCategorie[] = ['VALIDATEUR', 'DEMANDEUR', 'CAISSIER', 'INTERIM'];

const CATEGORIE_BADGE: Record<ProfilCategorie, { cls: string; icon: LucideIcon }> = {
  VALIDATEUR: { cls: 'bg-[#FFFBEB] text-[#78350F]', icon: BadgeCheck },
  CAISSIER: { cls: 'bg-[#ECFDF5] text-[#065F46]', icon: Banknote },
  DEMANDEUR: { cls: 'bg-[#F8FAFC] text-[#475569]', icon: UserIcon },
  INTERIM: { cls: 'bg-[#F5F3FF] text-[#6D28D9]', icon: Repeat },
};

const selectClass =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

const schema = z.object({
  code: z.string().min(1, 'Requis'),
  libelle: z.string().min(1, 'Requis'),
  categorie: z.enum(['VALIDATEUR', 'DEMANDEUR', 'CAISSIER', 'INTERIM']),
  description: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

function ProfilBadge({ profil }: { profil: Profil }) {
  const b = CATEGORIE_BADGE[profil.categorie] ?? { cls: 'bg-[#F8FAFC] text-[#475569]', icon: UserIcon };
  const Icon = b.icon;
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold', b.cls)}>
      <Icon className="h-3.5 w-3.5" />
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
          categorie: profil.categorie,
          description: profil.description ?? '',
        }
      : { code: '', libelle: '', categorie: 'DEMANDEUR', description: '' },
  });

  const onSubmit = handleSubmit((values) => {
    const payload = {
      code: values.code,
      libelle: values.libelle,
      categorie: values.categorie,
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
          <Label htmlFor="categorie">Catégorie</Label>
          <select id="categorie" className={selectClass} {...register('categorie')}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
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
      <td className="px-4 py-3 text-[11px] text-[#64748B]">{profil.categorie}</td>
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

  return (
    <Panel>
      <PanelHeader title={`Permissions — ${profil.libelle}`} badge={`${assignedIds.size}`} />
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
  );
}

function ProfilsPageInner() {
  const { data: profils, isLoading } = useProfils();
  const remove = useDeleteProfil();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // form: { mode: 'create' } | { mode: 'edit', profil } | null
  const [form, setForm] = useState<{ profil: Profil | null } | null>(null);
  const selected = profils?.find((p) => p.id === selectedId) ?? null;

  return (
    <div className="flex flex-col gap-4">
      {form && <ProfilForm profil={form.profil} onDone={() => setForm(null)} />}

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
                <th className="px-4 py-2.5 text-left font-semibold">Profil</th>
                <th className="px-4 py-2.5 text-left font-semibold">Catégorie</th>
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
                  onDelete={() => {
                    if (confirm(`Désactiver le profil ${profil.code} ?`)) {
                      remove.mutate(profil.id);
                      if (selectedId === profil.id) setSelectedId(null);
                    }
                  }}
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
