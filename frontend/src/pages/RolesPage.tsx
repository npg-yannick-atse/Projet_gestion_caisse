import { useEffect, useMemo, useState } from 'react';
import { Copy, Banknote, Briefcase, Check, Eye, Pencil, ShieldCheck, User, X, type LucideIcon } from 'lucide-react';
import { useRoles, usePermissions, useRolePermissions, useTogglePermission } from '@/api/roles';
import type { Permission, Role, RoleCode } from '@/types/api';
import { cn } from '@/lib/utils';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { SortableHeader } from '@/components/SortableHeader';
import { useTableSort } from '@/hooks/useTableSort';
import { useClientSort } from '@/hooks/useClientSort';
import { RoleGuard } from '@/components/RoleGuard';
import { GenererDepuisModal } from '@/components/GenererDepuisModal';
import { useGenererProfilDepuisRole } from '@/api/profils';

const ROLE_BADGE: Record<RoleCode, { cls: string; icon: LucideIcon }> = {
  SUPER_ADMIN: { cls: 'bg-[#EFF6FF] text-[#0C447C]', icon: ShieldCheck },
  ADMINISTRATEUR: { cls: 'bg-[#EFF6FF] text-[#0C447C]', icon: ShieldCheck },
  VALIDATEUR: { cls: 'bg-[#FFFBEB] text-[#78350F]', icon: Eye },
  CAISSIER: { cls: 'bg-[#ECFDF5] text-[#065F46]', icon: Banknote },
  GESTIONNAIRE_PORTEFEUILLE: { cls: 'bg-[#ECFEFF] text-[#0E7490]', icon: Briefcase },
  DAF: { cls: 'bg-[#F5F3FF] text-[#5B21B6]', icon: ShieldCheck },
  DEMANDEUR: { cls: 'bg-[#F8FAFC] text-[#475569]', icon: User },
};

/**
 * Les quatre droits résumés dans la matrice.
 *
 * L'intitulé dit CE QUE LA COCHE AUTORISE, et la ligne en dessous précise sur
 * quoi. « Valider » ou « Décaisser » tout court ne disaient ni sur quel objet
 * ni avec quelle portée : on lisait un verbe sans complément, et l'on croyait
 * que ces quatre colonnes résumaient tout le rôle.
 */
const MATRIX_COLS: { code: string; label: string; precision: string }[] = [
  { code: 'BON_CREER', label: 'Créer un bon', precision: 'Saisir une demande de dépense' },
  { code: 'BON_VALIDER', label: 'Valider un bon', precision: 'Approuver ou refuser la dépense' },
  { code: 'BON_DECAISSER', label: 'Décaisser un bon', precision: "Sortir l'argent de la caisse" },
  { code: 'ADMIN_USER', label: 'Gérer les utilisateurs', precision: 'Comptes, rôles et droits' },
];

function RoleBadge({ role }: { role: Role }) {
  const b = ROLE_BADGE[role.code] ?? { cls: 'bg-[#F8FAFC] text-[#475569]', icon: User };
  const Icon = b.icon;
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold', b.cls)}>
      <Icon className="h-3.5 w-3.5" />
      {role.libelle}
    </span>
  );
}

function Cell({ on }: { on: boolean }) {
  return on ? <Check className="mx-auto h-4 w-4 text-[#00C896]" /> : <X className="mx-auto h-4 w-4 text-[#CBD5E1]" />;
}

function RoleRow({
  role,
  selected,
  onEdit,
}: {
  role: Role;
  selected: boolean;
  onEdit: () => void;
}) {
  const { data: perms } = useRolePermissions(role.id);
  const has = (code: string) => !!perms?.some((p) => p.code === code);
  return (
    <tr className={cn('border-t border-[rgba(15,76,129,0.07)] hover:bg-[#FAFBFF]', selected && 'bg-[#FAFBFF]')}>
      <td className="px-4 py-3">
        <RoleBadge role={role} />
      </td>
      {/* Total AVANT les colonnes cochées : on lit d'abord combien de droits
          porte le rôle, ensuite le détail de quelques-uns. */}
      <td className="px-4 py-3 text-center text-xs tabular-nums font-semibold text-[#0F172A]">
        {perms?.length ?? '—'}
      </td>
      {MATRIX_COLS.map((c) => (
        <td key={c.code} className="px-4 py-3 text-center">
          <Cell on={has(c.code)} />
        </td>
      ))}
      <td className="px-4 py-3 text-right">
        <button
          type="button"
          onClick={onEdit}
          aria-label="Modifier les permissions"
          className={cn(
            'inline-flex h-7 w-7 items-center justify-center rounded-[7px] border border-[rgba(15,76,129,0.1)] bg-white text-[#475569] transition-colors hover:bg-[#EFF6FF] hover:text-[#1A6DB5]',
            selected && 'border-[#1A6DB5] bg-[#EFF6FF] text-[#1A6DB5]',
          )}
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  );
}

function PermissionRow({ permission, roleId, assigned }: { permission: Permission; roleId: string; assigned: boolean }) {
  const toggle = useTogglePermission(roleId);
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

function PermissionEditor({ role, onClose }: { role: Role; onClose: () => void }) {
  const { data: permissions } = usePermissions();
  const rolePerms = useRolePermissions(role.id);
  const assignedIds = useMemo(() => new Set((rolePerms.data ?? []).map((p) => p.id)), [rolePerms.data]);

  const byModule = useMemo(() => {
    const map = new Map<string, Permission[]>();
    for (const p of permissions ?? []) {
      const list = map.get(p.module) ?? [];
      list.push(p);
      map.set(p.module, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [permissions]);

  const [genererProfil, setGenererProfil] = useState(false);
  const generer = useGenererProfilDepuisRole();

  return (
    <>
    {genererProfil && (
      <GenererDepuisModal
        titre="Générer un profil depuis ce rôle"
        sourceLibelle={role.libelle}
        nbPermissions={assignedIds.size}
        avertissement="Seules les permissions sont copiées. Ce qu'un rôle décide par son code — voir les bons de tous, contourner les contrôles en administrateur, modifier un bon — ne se transmet jamais à un profil."
        pending={generer.isPending}
        error={generer.error}
        onValider={(code, libelle) =>
          generer.mutate({ roleId: role.id, code, libelle }, { onSuccess: () => setGenererProfil(false) })
        }
        onClose={() => setGenererProfil(false)}
      />
    )}
    <Panel>
      <PanelHeader title={`Permissions — ${role.libelle}`} badge={`${assignedIds.size}`}>
        {/* Repartir de ce rôle pour fabriquer un profil : même socle de
            permissions, sans les pouvoirs que le CODE du rôle déclenche. */}
        <button
          type="button"
          onClick={() => setGenererProfil(true)}
          className="ml-auto flex items-center gap-1.5 rounded-[9px] border border-[rgba(15,76,129,0.12)] bg-white px-3 py-1.5 text-[11px] font-medium text-[#0F4C81] transition hover:bg-[#EFF6FF]"
        >
          <Copy className="h-3.5 w-3.5" /> Générer un profil
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className="inline-flex h-7 w-7 items-center justify-center rounded-[7px] border border-[rgba(15,76,129,0.1)] bg-white text-[#475569] transition-colors hover:bg-[#EFF6FF] hover:text-[#1A6DB5]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </PanelHeader>
      {/* Les permissions défilent à l'intérieur : l'en-tête (nom du rôle, compteur
          et fermeture) reste visible malgré une soixantaine de lignes. */}
      <div className="grid max-h-[70vh] gap-5 overflow-y-auto p-[18px] sm:grid-cols-2">
        {byModule.map(([module, perms]) => (
          <div key={module} className="space-y-1">
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.7px] text-[#64748B]">{module}</h3>
            {perms.map((p) => (
              <PermissionRow key={p.id} permission={p} roleId={role.id} assigned={assignedIds.has(p.id)} />
            ))}
          </div>
        ))}
        {byModule.length === 0 && <p className="text-sm text-[#64748B]">Aucune permission définie.</p>}
      </div>
    </Panel>
    </>
  );
}

const ROLE_SORT_COLUMNS = ['libelle'] as const;
type RoleSortCol = (typeof ROLE_SORT_COLUMNS)[number];

function RolesPageInner() {
  const { data: rolesBruts, isLoading } = useRoles();
  // Seul le nom du rôle est triable : les autres colonnes sont une matrice de
  // cases à cocher (permission accordée ou non), trier dessus n'aurait pas de sens.
  const sort = useTableSort<RoleSortCol>('/roles', ROLE_SORT_COLUMNS);
  const roles = useClientSort(rolesBruts, sort.state, { libelle: (r) => r.libelle });
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const selectedRole = roles?.find((r) => r.id === selectedRoleId) ?? null;

  // Échap ferme la modale, comme attendu de toute boîte de dialogue.
  useEffect(() => {
    if (!selectedRole) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedRoleId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedRole]);

  return (
    <div className="flex flex-col gap-4">
      <Panel>
        <PanelHeader title="Gestion des rôles" badge={`${roles?.length ?? 0}`} />

        {isLoading && <div className="px-[18px] py-8 text-sm text-[#64748B]">Chargement…</div>}

        {roles && (
          <table className="w-full text-xs">
            <thead className="bg-[#F8FAFC]">
              <tr className="text-[10px] uppercase tracking-[0.7px] text-[#64748B]">
                <SortableHeader column="libelle" state={sort.state} onSort={sort.setSort}>Rôle</SortableHeader>
                <th className="w-28 px-4 py-2.5 text-center font-semibold" title="Nombre total de permissions du rôle">
                  Permissions
                </th>
                {MATRIX_COLS.map((c) => (
                  <th key={c.code} className="px-4 py-2 text-center font-semibold" title={c.code}>
                    <div className="text-[10px] text-[#334155]">{c.label}</div>
                    <div className="mt-0.5 text-[9px] font-normal normal-case tracking-normal text-[#94A3B8]">
                      {c.precision}
                    </div>
                  </th>
                ))}
                <th className="px-4 py-2.5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {roles.map((role) => (
                <RoleRow
                  key={role.id}
                  role={role}
                  selected={selectedRoleId === role.id}
                  onEdit={() => setSelectedRoleId((id) => (id === role.id ? null : role.id))}
                />
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      {selectedRole && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center"
          onClick={() => setSelectedRoleId(null)}
        >
          <div className="w-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
            <PermissionEditor role={selectedRole} onClose={() => setSelectedRoleId(null)} />
          </div>
        </div>
      )}
    </div>
  );
}

export function RolesPage() {
  return (
    <RoleGuard allow={['SUPER_ADMIN', 'ADMINISTRATEUR']}>
      <RolesPageInner />
    </RoleGuard>
  );
}
