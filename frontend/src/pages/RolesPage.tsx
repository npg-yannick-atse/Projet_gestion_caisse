import { useMemo, useState } from 'react';
import { Banknote, Briefcase, Check, Eye, Pencil, ShieldCheck, User, X, type LucideIcon } from 'lucide-react';
import { useRoles, usePermissions, useRolePermissions, useTogglePermission } from '@/api/roles';
import type { Permission, Role, RoleCode } from '@/types/api';
import { cn } from '@/lib/utils';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { RoleGuard } from '@/components/RoleGuard';

const ROLE_BADGE: Record<RoleCode, { cls: string; icon: LucideIcon }> = {
  SUPER_ADMIN: { cls: 'bg-[#EFF6FF] text-[#0C447C]', icon: ShieldCheck },
  ADMINISTRATEUR: { cls: 'bg-[#EFF6FF] text-[#0C447C]', icon: ShieldCheck },
  VALIDATEUR: { cls: 'bg-[#FFFBEB] text-[#78350F]', icon: Eye },
  CAISSIER: { cls: 'bg-[#ECFDF5] text-[#065F46]', icon: Banknote },
  GESTIONNAIRE_PORTEFEUILLE: { cls: 'bg-[#ECFEFF] text-[#0E7490]', icon: Briefcase },
  DEMANDEUR: { cls: 'bg-[#F8FAFC] text-[#475569]', icon: User },
};

const MATRIX_COLS: { code: string; label: string }[] = [
  { code: 'BON_CREER', label: 'Créer bon' },
  { code: 'BON_VALIDER', label: 'Valider' },
  { code: 'BON_DECAISSER', label: 'Décaisser' },
  { code: 'ADMIN_USER', label: 'Gestion users' },
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

function RoleRow({ role, selected, onEdit }: { role: Role; selected: boolean; onEdit: () => void }) {
  const { data: perms } = useRolePermissions(role.id);
  const has = (code: string) => !!perms?.some((p) => p.code === code);
  return (
    <tr className={cn('border-t border-[rgba(15,76,129,0.07)] hover:bg-[#FAFBFF]', selected && 'bg-[#FAFBFF]')}>
      <td className="px-4 py-3">
        <RoleBadge role={role} />
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

function PermissionEditor({ role }: { role: Role }) {
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

  return (
    <Panel>
      <PanelHeader title={`Permissions — ${role.libelle}`} badge={`${assignedIds.size}`} />
      <div className="grid gap-5 p-[18px] sm:grid-cols-2">
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
  );
}

function RolesPageInner() {
  const { data: roles, isLoading } = useRoles();
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const selectedRole = roles?.find((r) => r.id === selectedRoleId) ?? null;

  return (
    <div className="flex flex-col gap-4">
      <Panel>
        <PanelHeader title="Gestion des rôles" badge={`${roles?.length ?? 0}`} />

        {isLoading && <div className="px-[18px] py-8 text-sm text-[#64748B]">Chargement…</div>}

        {roles && (
          <table className="w-full text-xs">
            <thead className="bg-[#F8FAFC]">
              <tr className="text-[10px] uppercase tracking-[0.7px] text-[#64748B]">
                <th className="px-4 py-2.5 text-left font-semibold">Rôle</th>
                {MATRIX_COLS.map((c) => (
                  <th key={c.code} className="px-4 py-2.5 text-center font-semibold">
                    {c.label}
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

      {selectedRole ? (
        <PermissionEditor role={selectedRole} />
      ) : (
        <p className="px-1 text-xs text-[#64748B]">
          Cliquez sur l'icône <Pencil className="inline h-3 w-3" /> d'un rôle pour gérer toutes ses permissions.
        </p>
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
