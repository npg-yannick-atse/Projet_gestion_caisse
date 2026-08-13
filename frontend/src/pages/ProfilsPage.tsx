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
  X,
  Search,
} from 'lucide-react';
import {
  useProfils,
  useProfilPermissions,
  useToggleProfilPermission,
  useCreateProfil,
  useUpdateProfil,
  useDeleteProfil,
  usePerimetreProfil,
  useSetPerimetreProfil,
  type PerimetreProfil,
} from '@/api/profils';
import { usePermissions, useRoles } from '@/api/roles';
import { useCostCenters, useDivisions, useNaturesOperation } from '@/api/referentiel';
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

/**
 * Un périmètre porté par le profil : divisions, natures ou centres de coût.
 *
 * Même mécanique que sur la fiche utilisateur — cases à cocher, recherche, et
 * un « tout cocher » qui n'agit que sur ce qui est visible. L'enregistrement
 * porte la sélection complète, en une requête.
 */
function PerimetreEditor({
  profil,
  quoi,
  titre,
  aide,
  elements,
}: {
  profil: Profil;
  quoi: PerimetreProfil;
  titre: string;
  aide: string;
  elements: Array<{ id: string; code?: string | null; libelle: string }> | undefined;
}) {
  const { data: choisis } = usePerimetreProfil(profil.id, quoi);
  const enregistrer = useSetPerimetreProfil(profil.id, quoi);
  const [recherche, setRecherche] = useState('');

  const selection = useMemo(() => new Set((choisis ?? []).map(String)), [choisis]);
  const visibles = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return (elements ?? []).filter(
      (e) => !q || e.libelle.toLowerCase().includes(q) || (e.code ?? '').toLowerCase().includes(q),
    );
  }, [elements, recherche]);

  const appliquer = (ids: string[]) => enregistrer.mutate(ids);
  const idsVisibles = visibles.map((e) => String(e.id));
  const visiblesCoches = idsVisibles.filter((id) => selection.has(id)).length;

  return (
    <Panel>
      <PanelHeader title={`${titre} — ${profil.libelle}`} badge={`${selection.size}`} />
      <div className="space-y-2 p-[18px]">
        <p className="text-[11px] text-[#94A3B8]">{aide}</p>

        <div className="flex items-center gap-2 rounded-[9px] border border-[rgba(15,76,129,0.1)] bg-[#F8FAFC] px-2.5 py-1.5">
          <Search className="h-3.5 w-3.5 shrink-0 text-[#64748B]" />
          <input
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher…"
            className="flex-1 bg-transparent text-xs text-[#0F172A] outline-none"
          />
          <span className="shrink-0 text-[10px] text-[#94A3B8]">{visibles.length}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <button
            type="button"
            disabled={enregistrer.isPending || idsVisibles.length === 0 || visiblesCoches === idsVisibles.length}
            onClick={() => appliquer([...new Set([...selection, ...idsVisibles])])}
            className="rounded-[7px] border border-[rgba(15,76,129,0.15)] px-2 py-1 font-medium text-[#0F4C81] transition hover:bg-[#EFF6FF] disabled:opacity-40"
          >
            Tout cocher ({idsVisibles.length})
          </button>
          <button
            type="button"
            disabled={enregistrer.isPending || visiblesCoches === 0}
            onClick={() => appliquer([...selection].filter((id) => !idsVisibles.includes(id)))}
            className="rounded-[7px] border border-[rgba(15,76,129,0.15)] px-2 py-1 font-medium text-[#475569] transition hover:bg-[#F1F5F9] disabled:opacity-40"
          >
            Tout décocher
          </button>
          <span className="text-[#94A3B8]">
            {enregistrer.isPending ? 'Enregistrement…' : `${selection.size} sélectionné(s)`}
          </span>
        </div>

        <div className="grid max-h-[320px] grid-cols-2 gap-1 overflow-y-auto">
          {visibles.map((e) => {
            const coche = selection.has(String(e.id));
            return (
              <label
                key={e.id}
                className="flex cursor-pointer items-center gap-2 rounded-[7px] px-2 py-1 hover:bg-[#F8FAFC]"
              >
                <input
                  type="checkbox"
                  checked={coche}
                  disabled={enregistrer.isPending}
                  onChange={() =>
                    appliquer(
                      coche
                        ? [...selection].filter((id) => id !== String(e.id))
                        : [...selection, String(e.id)],
                    )
                  }
                  className="h-4 w-4"
                />
                <span className="truncate text-xs">
                  {e.code && <span className="mr-1.5 font-mono text-[#64748B]">{e.code}</span>}
                  {e.libelle}
                </span>
              </label>
            );
          })}
          {visibles.length === 0 && (
            <p className="col-span-2 py-6 text-center text-sm text-[#64748B]">
              {recherche ? 'Aucun résultat.' : 'Rien à rattacher.'}
            </p>
          )}
        </div>
      </div>
    </Panel>
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
  const [volet, setVolet] = useState<'permissions' | 'roles' | 'cost-centers' | 'divisions' | 'natures-operation'>('permissions');
  const { data: costCenters } = useCostCenters();
  const { data: divisions } = useDivisions();
  const { data: natures } = useNaturesOperation();
  const { data: roles } = useRoles();

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
                <th className="w-32 px-4 py-2.5 text-center font-semibold">Permissions</th>
                <th className="w-28 px-4 py-2.5 text-right">
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
                  <td colSpan={3} className="px-4 py-8 text-center text-sm text-[#64748B]">
                    Aucun profil. Cliquez sur « Nouveau profil » pour créer un paquet de permissions réutilisable.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </Panel>

      {/* En MODALE, plus en bas de page : le panneau poussait le tableau hors
          de l'écran, si bien qu'on ne voyait plus quel profil on éditait — et
          il fallait remonter pour en changer. */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center"
          onClick={() => setSelectedId(null)}
        >
          {/* La carte ne défile plus dans son ensemble : en-tête et onglets
              restent fixes, seul le corps défile. Auparavant les onglets
              partaient vers le haut avec le contenu, et il fallait remonter à
              chaque changement de volet. */}
          <div
            className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-[14px] border border-[rgba(15,76,129,0.1)] bg-white shadow-[0_16px_48px_rgba(15,23,42,0.24)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center gap-3 border-b border-[rgba(15,76,129,0.08)] bg-[#F8FAFC] px-4 py-3">
              <ProfilBadge profil={selected} />
              <span className="font-mono text-[11px] text-[#94A3B8]">{selected.code}</span>
              <button
                type="button"
                aria-label="Fermer"
                onClick={() => setSelectedId(null)}
                className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] text-[#94A3B8] transition-colors hover:bg-[#F1F5F9] hover:text-[#0F172A]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

          {/* Un profil ne porte plus seulement des permissions : il transmet
              aussi des périmètres (migration 0067). Quatre volets pour quatre
              natures de contenu, plutôt qu'un panneau qui mélangerait tout. */}
          {/* Fond opaque : sans lui, les onglets inactifs n'avaient qu'une
              bordure, et le voile sombre de la modale transparaissait au
              travers jusqu'à rendre leur texte illisible. */}
          <div className="flex shrink-0 flex-wrap gap-1.5 border-b border-[rgba(15,76,129,0.08)] bg-white px-4 py-2.5">
            {(
              [
                ['permissions', 'Permissions'],
                ['roles', 'Rôles'],
                ['cost-centers', 'Centres de coût'],
                ['divisions', 'Divisions'],
                ['natures-operation', 'Natures'],
              ] as const
            ).map(([cle, libelle]) => (
              <button
                key={cle}
                type="button"
                onClick={() => setVolet(cle)}
                className={
                  volet === cle
                    ? 'inline-flex items-center gap-1.5 rounded-[9px] bg-[#0F4C81] px-3.5 py-1.5 text-xs font-medium text-white'
                    : 'inline-flex items-center gap-1.5 rounded-[9px] border border-[rgba(15,76,129,0.15)] bg-white px-3.5 py-1.5 text-xs font-medium text-[#475569] hover:bg-[#F1F5F9]'
                }
              >
                {libelle}
              </button>
            ))}
          </div>

          {/* Seule zone qui défile : la liste des permissions dépasse
              largement la hauteur de l'écran. */}
          <div className="flex-1 overflow-y-auto p-4">
          {volet === 'permissions' && <PermissionEditor profil={selected} />}
          {volet === 'roles' && (
            <PerimetreEditor
              profil={selected}
              quoi="roles"
              titre="Rôles"
              aide="Quiconque reçoit ce profil obtient ces rôles. Un profil portant Super Administrateur rend donc administrateur — avec le contournement des contrôles que cela implique."
              elements={(roles ?? []).map((r) => ({ id: r.id, code: r.code, libelle: r.libelle }))}
            />
          )}
          {volet === 'cost-centers' && (
            <PerimetreEditor
              profil={selected}
              quoi="cost-centers"
              titre="Centres de coût"
              aide="Ces centres de coût s'ajoutent à ceux de la direction de chaque personne qui reçoit ce profil."
              elements={(costCenters ?? []).map((c) => ({ id: c.id, code: c.code, libelle: c.libelle }))}
            />
          )}
          {volet === 'divisions' && (
            <PerimetreEditor
              profil={selected}
              quoi="divisions"
              titre="Divisions"
              aide="Autorise les restitutions client sur ces divisions, pour quiconque reçoit ce profil."
              elements={(divisions ?? []).map((d) => ({ id: d.id, code: d.code, libelle: d.libelle }))}
            />
          )}
          {volet === 'natures-operation' && (
            <PerimetreEditor
              profil={selected}
              quoi="natures-operation"
              titre="Natures"
              aide="Natures utilisables à la création d'un bon par quiconque reçoit ce profil."
              elements={(natures ?? []).map((n) => ({ id: n.id, code: n.code, libelle: n.libelle }))}
            />
          )}
          </div>
          </div>
        </div>
      )}

      <p className="px-1 text-xs text-[#64748B]">
        Icône <KeyRound className="inline h-3 w-3" /> = permissions · <Pencil className="inline h-3 w-3" /> = modifier ·{' '}
        <Trash2 className="inline h-3 w-3" /> = désactiver.
      </p>

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
