import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, BadgeCheck, Globe, Plus, Search, Settings2, ShieldCheck, Tags, Trash2, UserPlus, X, type LucideIcon } from 'lucide-react';
import {
  useUsers,
  useCreateUser,
  useDeleteUser,
  useUpdateUser,
  useUserAssignedRoles,
  useToggleUserRole,
  useUserProfils,
  useToggleUserProfil,
  useUserDivisions,
  useToggleUserDivision,
  useUserNaturesOperation,
  useToggleUserNatureOperation,
} from '@/api/users';
import { useProfils } from '@/api/profils';
import { useDirections } from '@/api/directions';
import { usePays, useDivisions, useNaturesOperation } from '@/api/referentiel';
import { useTableSort } from '@/hooks/useTableSort';
import type { SortDir } from '@/components/SortableHeader';

const USERS_SORT_COLUMNS = ['nom', 'prenom', 'matricule', 'email', 'estActif'] as const;
type UserSortCol = (typeof USERS_SORT_COLUMNS)[number];

const SORT_LABELS: Record<UserSortCol, string> = {
  nom: 'Nom',
  prenom: 'Prénom',
  matricule: 'Matricule',
  email: 'Email',
  estActif: 'Statut',
};
import { useRoles } from '@/api/roles';
import { useLdapUsers } from '@/api/ldap';
import { useAuthStore } from '@/stores/auth.store';
import { apiErrorMessage } from '@/lib/utils';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import type { LdapUser, User } from '@/types/api';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { Pill } from '@/components/ui/pill';
import { RoleGuard } from '@/components/RoleGuard';

const AVATARS = [
  'from-[#0F4C81] to-[#1A6DB5]',
  'from-[#047857] to-[#00C896]',
  'from-[#5B21B6] to-[#7C3AED]',
  'from-[#991B1B] to-[#EF4444]',
];

function LdapPicker({ existingMatricules }: { existingMatricules: Set<string> }) {
  const { data: ldap, isLoading, isError, error } = useLdapUsers();
  const createUser = useCreateUser();
  const [search, setSearch] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (ldap ?? [])
      .filter((u) => !existingMatricules.has(u.matricule))
      .filter((u) =>
        !q
          ? true
          : `${u.prenom} ${u.nom}`.toLowerCase().includes(q) ||
            u.username.toLowerCase().includes(q) ||
            u.matricule.toLowerCase().includes(q) ||
            (u.email ?? '').toLowerCase().includes(q),
      )
      .slice(0, 30);
  }, [ldap, search, existingMatricules]);

  const add = (u: LdapUser) => {
    setErrMsg(null);
    setPending(u.matricule);
    const email = u.email && u.email.includes('@') ? u.email : `${u.username}@npgandour.com`;
    createUser.mutate(
      { matricule: u.matricule, nom: u.nom, prenom: u.prenom, email },
      {
        onSettled: () => setPending(null),
        onError: (e) => setErrMsg(apiErrorMessage(e, "Ajout impossible")),
      },
    );
  };

  return (
    <Panel>
      <PanelHeader title="Ajouter depuis l'annuaire LDAP" badge={`${candidates.length}`} />
      <div className="flex items-center gap-2 border-b border-[rgba(15,76,129,0.07)] px-[18px] py-3">
        <Search className="h-4 w-4 text-[#64748B]" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Chercher un agent (nom, identifiant, matricule, email)…"
          className="w-full rounded-[9px] border border-[rgba(15,76,129,0.1)] bg-[#F8FAFC] px-3 py-1.5 text-xs text-[#0F172A] outline-none focus:border-[#1A6DB5] focus:bg-white"
        />
      </div>

      {isLoading && <div className="px-[18px] py-6 text-sm text-[#64748B]">Chargement de l'annuaire…</div>}
      {isError && (
        <div className="px-[18px] py-6 text-sm text-[#EF4444]">
          Annuaire LDAP injoignable. {apiErrorMessage(error, '')}
        </div>
      )}
      {errMsg && <div className="px-[18px] pt-3 text-sm text-[#EF4444]">{errMsg}</div>}

      {ldap && (
        <div className="max-h-[420px] overflow-y-auto">
          {candidates.length === 0 ? (
            <div className="py-8 text-center text-sm text-[#64748B]">
              {search ? 'Aucun résultat.' : 'Tape un nom ou un identifiant pour chercher.'}
            </div>
          ) : (
            <ul className="divide-y divide-[rgba(15,76,129,0.07)]">
              {candidates.map((u) => (
                <li key={u.matricule} className="flex items-center gap-3 px-[18px] py-3 hover:bg-[#FAFBFF]">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-gradient-to-br from-[#0F4C81] to-[#1A6DB5] text-xs font-semibold text-white">
                    {(u.prenom[0] ?? '').toUpperCase()}
                    {(u.nom[0] ?? '').toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-[#0F172A]">
                      {u.prenom} {u.nom}
                    </div>
                    <div className="truncate text-[11px] text-[#64748B]">
                      {u.username} · #{u.matricule}
                      {u.email ? ` · ${u.email}` : ''}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={pending === u.matricule || createUser.isPending}
                    onClick={() => add(u)}
                    className="ml-auto inline-flex items-center gap-1 rounded-[7px] bg-[#0F4C81] px-3 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-[#1A6DB5] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {pending === u.matricule ? 'Ajout…' : 'Ajouter'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Panel>
  );
}

type EditorTab = 'general' | 'roles' | 'profils' | 'divisions' | 'natures';

function TabBtn({
  active,
  onClick,
  icon: Icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: LucideIcon;
  label: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-4 py-2.5 text-xs font-medium transition-colors ${
        active
          ? 'border-[#0F4C81] text-[#0F4C81]'
          : 'border-transparent text-[#64748B] hover:text-[#0F172A]'
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
      {count !== undefined && (
        <span
          className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
            active ? 'bg-[#EFF6FF] text-[#0F4C81]' : 'bg-[#F1F5F9] text-[#64748B]'
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function UserRolesEditor({ user, onClose }: { user: User; onClose: () => void }) {
  const { data: roles } = useRoles();
  const { data: userRoles, isLoading } = useUserAssignedRoles(user.id);
  const toggle = useToggleUserRole(user.id);
  const assigned = useMemo(() => new Set((userRoles ?? []).map((r) => r.id)), [userRoles]);
  const { data: profils } = useProfils();
  const { data: userProfils } = useUserProfils(user.id);
  const toggleProfil = useToggleUserProfil(user.id);
  const assignedProfils = useMemo(() => new Set((userProfils ?? []).map((p) => p.id)), [userProfils]);
  // Accès division (restitutions)
  const { data: pays } = usePays();
  const { data: allDivisions } = useDivisions();
  const { data: userDivisions } = useUserDivisions(user.id);
  const toggleDivision = useToggleUserDivision(user.id);
  const divisionAccess = useMemo(() => new Set(userDivisions ?? []), [userDivisions]);
  // Natures d'opération autorisées (création de bons)
  const { data: allNatures } = useNaturesOperation();
  const { data: userNatures } = useUserNaturesOperation(user.id);
  const toggleNature = useToggleUserNatureOperation(user.id);
  const natureAccess = useMemo(() => new Set(userNatures ?? []), [userNatures]);
  const { data: directions } = useDirections();
  const updateUser = useUpdateUser();
  const currentUser = useAuthStore((s) => s.user);
  // Sécurité anti-lockout : un administrateur ne peut pas modifier ses propres rôles.
  // S'il a besoin de changer ses propres droits, un autre admin/super-admin doit le faire.
  const isSelf = currentUser?.id === user.id;

  // Onglet actif — on ouvre par défaut sur « Rôles » (le bouton = attribuer un rôle).
  const [tab, setTab] = useState<EditorTab>('roles');
  const initials = `${user.prenom?.[0] ?? ''}${user.nom?.[0] ?? ''}`.toUpperCase() || '?';

  // Fermeture au clavier (Échap).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-[14px] border border-[rgba(15,76,129,0.1)] bg-white shadow-[0_16px_48px_rgba(15,23,42,0.24)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* En-tête : identité de l'utilisateur */}
        <div className="flex items-center gap-3 border-b border-[rgba(15,76,129,0.08)] bg-[#F8FAFC] px-5 py-3.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] bg-gradient-to-br from-[#0F4C81] to-[#1A6DB5] text-sm font-semibold text-white">
            {initials}
          </div>
          <div className="min-w-0">
            <div className="truncate font-display text-sm font-semibold text-[#0F172A]">
              {user.prenom} {user.nom}
            </div>
            <div className="truncate text-[11px] text-[#64748B]">
              {user.email} · #{user.matricule}
            </div>
          </div>
          <button
            type="button"
            aria-label="Fermer"
            onClick={onClose}
            className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] text-[#94A3B8] transition-colors hover:bg-white hover:text-[#0F172A]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Onglets (volets) */}
        <div className="flex items-center gap-1 overflow-x-auto border-b border-[rgba(15,76,129,0.08)] px-3">
          <TabBtn active={tab === 'general'} onClick={() => setTab('general')} icon={Settings2} label="Général" />
          <TabBtn active={tab === 'roles'} onClick={() => setTab('roles')} icon={ShieldCheck} label="Rôles" count={assigned.size} />
          <TabBtn active={tab === 'profils'} onClick={() => setTab('profils')} icon={BadgeCheck} label="Profils" count={assignedProfils.size} />
          <TabBtn active={tab === 'divisions'} onClick={() => setTab('divisions')} icon={Globe} label="Divisions" count={divisionAccess.size} />
          <TabBtn active={tab === 'natures'} onClick={() => setTab('natures')} icon={Tags} label="Natures" count={natureAccess.size} />
        </div>

        {/* Verrou anti-lockout (toujours visible s'il s'agit de soi) */}
        {isSelf && (
          <div className="flex items-start gap-2 border-b border-[#FECDCA] bg-[#FEF3F2] px-5 py-2.5 text-[12px] text-[#7F1D1D]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <strong className="font-semibold">Modification verrouillée.</strong> Vous ne pouvez pas
              modifier vos propres rôles/profils — demandez à un autre administrateur.
            </div>
          </div>
        )}

        {/* Corps — contenu de l'onglet actif */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* -------- Général : direction + plateformes -------- */}
          {tab === 'general' && (
            <div className="space-y-5">
              <div className="space-y-1.5">
                <label htmlFor={`dir-${user.id}`} className="text-[11px] font-semibold uppercase tracking-[0.7px] text-[#64748B]">
                  Direction
                </label>
                <select
                  id={`dir-${user.id}`}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={user.directionId ?? ''}
                  disabled={updateUser.isPending}
                  onChange={(e) =>
                    updateUser.mutate({ id: user.id, payload: { directionId: e.target.value || null } })
                  }
                >
                  <option value="">— Aucune —</option>
                  {directions?.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.code} — {d.libelle}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-[#94A3B8]">
                  Détermine les centres de coût que l'utilisateur peut choisir sur un bon.
                </p>
              </div>

              <div className="border-t border-[rgba(15,76,129,0.07)] pt-4">
                <span className="text-[11px] font-semibold uppercase tracking-[0.7px] text-[#64748B]">
                  Accès aux plateformes
                </span>
                <div className="mt-2 space-y-1">
                  {([
                    { key: 'accesWeb' as const, label: 'Application web', value: user.accesWeb ?? true },
                    { key: 'accesMobile' as const, label: 'Application mobile', value: user.accesMobile ?? true },
                  ]).map((p) => (
                    <label
                      key={p.key}
                      className={`flex items-center gap-3 rounded-[7px] px-2 py-1.5 ${
                        isSelf ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-[#F8FAFC]'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={p.value}
                        disabled={updateUser.isPending || isSelf}
                        onChange={(e) =>
                          updateUser.mutate({ id: user.id, payload: { [p.key]: e.target.checked } })
                        }
                        className="h-4 w-4"
                      />
                      <span className="flex-1 text-sm font-medium text-[#0F172A]">{p.label}</span>
                      {p.value ? <Pill tone="green">autorisé</Pill> : <Pill tone="gray">refusé</Pill>}
                    </label>
                  ))}
                </div>
                <p className="mt-1.5 text-[11px] text-[#94A3B8]">
                  La connexion est refusée si la plateforme utilisée n'est pas autorisée.
                </p>
              </div>
            </div>
          )}

          {/* -------- Rôles -------- */}
          {tab === 'roles' && (
            <div className="space-y-1">
              {isLoading && <p className="text-sm text-[#64748B]">Chargement…</p>}
              {roles?.map((role) => {
                const has = assigned.has(role.id);
                return (
                  <label
                    key={role.id}
                    className={`flex items-center gap-3 rounded-[7px] px-2 py-2 ${
                      isSelf ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-[#F8FAFC]'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={has}
                      disabled={toggle.isPending || isSelf}
                      onChange={() => toggle.mutate({ roleId: role.id, assigned: has })}
                      className="h-4 w-4"
                    />
                    <span className="flex-1 text-sm">
                      <span className="font-medium text-[#0F172A]">{role.libelle}</span>{' '}
                      <span className="text-[10px] text-[#94A3B8]">({role.code})</span>
                    </span>
                    {role.estSysteme && <Pill tone="blue">système</Pill>}
                  </label>
                );
              })}
              {roles && roles.length === 0 && (
                <p className="text-sm text-[#64748B]">
                  Aucun rôle disponible. Créez-en depuis l'écran « Rôles » d'abord.
                </p>
              )}
            </div>
          )}

          {/* -------- Profils -------- */}
          {tab === 'profils' && (
            <div className="space-y-1">
              <p className="mb-2 text-[11px] text-[#94A3B8]">
                Paquets de permissions additionnels — ils s'ajoutent aux permissions des rôles.
              </p>
              {profils?.map((profil) => {
                const has = assignedProfils.has(profil.id);
                return (
                  <label
                    key={profil.id}
                    className={`flex items-center gap-3 rounded-[7px] px-2 py-2 ${
                      isSelf ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-[#F8FAFC]'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={has}
                      disabled={toggleProfil.isPending || isSelf}
                      onChange={() => toggleProfil.mutate({ profilId: profil.id, assigned: has })}
                      className="h-4 w-4"
                    />
                    <span className="flex-1 text-sm">
                      <span className="font-medium text-[#0F172A]">{profil.libelle}</span>{' '}
                      <span className="text-[10px] text-[#94A3B8]">({profil.categorie})</span>
                    </span>
                  </label>
                );
              })}
              {profils && profils.length === 0 && (
                <p className="text-sm text-[#64748B]">
                  Aucun profil. Créez-en depuis l'écran « Profils ».
                </p>
              )}
            </div>
          )}

          {/* -------- Divisions (restitutions) -------- */}
          {tab === 'divisions' && (
            <div className="space-y-2">
              <p className="mb-1 text-[11px] text-[#94A3B8]">
                Autorise l'utilisateur à créer des restitutions client sur les divisions cochées.
              </p>
              {(pays ?? []).map((p) => {
                const divs = (allDivisions ?? []).filter((d) => d.paysId === p.id);
                if (divs.length === 0) return null;
                return (
                  <div key={p.id}>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.6px] text-[#94A3B8]">
                      {p.libelle}
                    </div>
                    <div className="mt-0.5 grid grid-cols-2 gap-1">
                      {divs.map((d) => {
                        const has = divisionAccess.has(d.id);
                        return (
                          <label
                            key={d.id}
                            className="flex cursor-pointer items-center gap-2 rounded-[7px] px-2 py-1 hover:bg-[#F8FAFC]"
                          >
                            <input
                              type="checkbox"
                              checked={has}
                              disabled={toggleDivision.isPending}
                              onChange={() => toggleDivision.mutate({ divisionId: d.id, has })}
                              className="h-4 w-4"
                            />
                            <span className="text-xs text-[#0F172A]">
                              {d.code} — {d.libelle}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {(allDivisions ?? []).length === 0 && (
                <p className="text-sm text-[#64748B]">Aucune division. Créez-en depuis « Pays &amp; Divisions ».</p>
              )}
            </div>
          )}

          {/* -------- Natures d'opération autorisées (création de bons) -------- */}
          {tab === 'natures' && (
            <div className="space-y-2">
              <p className="mb-1 text-[11px] text-[#94A3B8]">
                Limite les natures comptables utilisables à la création d'un bon.{' '}
                <strong>Sans aucune coche, l'utilisateur ne peut créer aucun bon</strong> (les administrateurs ne sont pas concernés).
              </p>
              <div className="grid grid-cols-2 gap-1">
                {(allNatures ?? []).map((n) => {
                  const has = natureAccess.has(n.id);
                  return (
                    <label
                      key={n.id}
                      className="flex cursor-pointer items-center gap-2 rounded-[7px] px-2 py-1 hover:bg-[#F8FAFC]"
                    >
                      <input
                        type="checkbox"
                        checked={has}
                        disabled={toggleNature.isPending}
                        onChange={() => toggleNature.mutate({ natureId: n.id, has })}
                        className="h-4 w-4"
                      />
                      <span className="text-xs text-[#0F172A]">
                        {n.code} — {n.libelle}
                      </span>
                    </label>
                  );
                })}
              </div>
              {(allNatures ?? []).length === 0 && (
                <p className="text-sm text-[#64748B]">Aucune nature d'opération. Créez-en depuis « Natures d'opération ».</p>
              )}
            </div>
          )}
        </div>

        {/* Pied : note + fermeture */}
        <div className="flex items-center gap-3 border-t border-[rgba(15,76,129,0.08)] bg-[#FAFBFC] px-5 py-3">
          <p className="flex-1 text-[11px] text-[#94A3B8]">
            L'utilisateur cumule les permissions de ses <strong>rôles</strong> ET de ses <strong>profils</strong>.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-[9px] bg-[#0F4C81] px-4 py-2 text-xs font-medium text-white transition hover:bg-[#1A6DB5]"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

function UsersPageInner() {
  const sort = useTableSort<UserSortCol>('/users', USERS_SORT_COLUMNS, {
    by: 'nom',
    dir: 'asc',
  });
  const { data: users, isLoading, isError } = useUsers({
    sortBy: sort.state.by ?? undefined,
    sortDir: sort.state.by ? sort.state.dir : undefined,
  });
  const deleteUser = useDeleteUser();
  const [pendingDelete, setPendingDelete] = useState<User | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [search, setSearch] = useState('');
  const [manageUser, setManageUser] = useState<User | null>(null);
  // On ré-aligne le panneau de gestion sur la donnée LIVE (refetch après mutation),
  // sinon le <select> Direction garde la valeur figée capturée à l'ouverture.
  const liveManageUser = manageUser
    ? ((users ?? []).find((u) => u.id === manageUser.id) ?? manageUser)
    : null;

  const toggleDir = () => {
    if (!sort.state.by) return;
    sort.setSort({ by: sort.state.by, dir: sort.state.dir === 'asc' ? 'desc' : 'asc' });
  };

  const existingMatricules = useMemo(
    () => new Set((users ?? []).map((u) => u.matricule)),
    [users],
  );

  const filtered = useMemo(() => {
    const list = users ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (u) =>
        `${u.prenom} ${u.nom}`.toLowerCase().includes(q) ||
        u.matricule.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q),
    );
  }, [users, search]);

  return (
    <div className="flex flex-col gap-4">
      {showPicker && <LdapPicker existingMatricules={existingMatricules} />}
      {liveManageUser && <UserRolesEditor user={liveManageUser} onClose={() => setManageUser(null)} />}

      <Panel>
        <PanelHeader title="Membres de l'équipe" badge={`${users?.length ?? 0}`}>
          <button
            type="button"
            onClick={() => setShowPicker((v) => !v)}
            className="ml-auto flex items-center gap-1.5 rounded-[9px] bg-[#0F4C81] px-3.5 py-1.5 text-[11px] font-medium text-white transition hover:bg-[#1A6DB5]"
          >
            <UserPlus className="h-4 w-4" />
            {showPicker ? "Fermer l'annuaire" : "Ajouter depuis l'annuaire"}
          </button>
        </PanelHeader>

        <div className="flex flex-wrap items-center gap-2 border-b border-[rgba(15,76,129,0.07)] px-[18px] py-3">
          <Search className="h-4 w-4 text-[#64748B]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un utilisateur…"
            className="flex-1 rounded-[9px] border border-[rgba(15,76,129,0.1)] bg-[#F8FAFC] px-3 py-1.5 text-xs text-[#0F172A] outline-none focus:border-[#1A6DB5] focus:bg-white"
          />

          {/* Tri serveur — URL-synced */}
          <div className="flex items-center gap-1.5 rounded-[9px] border border-[rgba(15,76,129,0.1)] bg-[#F8FAFC] px-2 py-1">
            <ArrowUpDown className="h-3.5 w-3.5 text-[#64748B]" />
            <span className="text-[10px] text-[#64748B]">Trier&nbsp;par</span>
            <select
              value={sort.state.by ?? ''}
              onChange={(e) => {
                const v = e.target.value as UserSortCol | '';
                sort.setSort({ by: v || null, dir: sort.state.dir });
              }}
              aria-label="Colonne de tri"
              className="bg-transparent text-[11px] text-[#0F172A] outline-none"
            >
              <option value="">— Aucun —</option>
              {USERS_SORT_COLUMNS.map((c) => (
                <option key={c} value={c}>
                  {SORT_LABELS[c]}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={toggleDir}
              disabled={!sort.state.by}
              aria-label={`Inverser le sens : ${sort.state.dir === 'asc' ? 'ascendant' : 'descendant'}`}
              title={sort.state.dir === 'asc' ? 'Ascendant — cliquer pour inverser' : 'Descendant — cliquer pour inverser'}
              className="flex h-5 w-5 items-center justify-center rounded text-[#475569] hover:bg-white disabled:opacity-30"
            >
              {(sort.state.dir as SortDir) === 'asc' ? (
                <ArrowUp className="h-3 w-3" />
              ) : (
                <ArrowDown className="h-3 w-3" />
              )}
            </button>
          </div>
        </div>

        {isLoading && <div className="px-[18px] py-8 text-sm text-[#64748B]">Chargement…</div>}
        {isError && <div className="px-[18px] py-8 text-sm text-[#EF4444]">Impossible de charger les utilisateurs.</div>}

        {users && (
          <div className="grid gap-3 p-[18px] sm:grid-cols-2">
            {filtered.length === 0 && (
              <div className="col-span-full py-8 text-center text-sm text-[#64748B]">Aucun utilisateur.</div>
            )}
            {filtered.map((u, i) => {
              const initials = `${u.prenom?.[0] ?? ''}${u.nom?.[0] ?? ''}`.toUpperCase() || '?';
              return (
                <div
                  key={u.id}
                  className="flex items-center gap-3 rounded-[11px] border border-[rgba(15,76,129,0.07)] bg-[#F8FAFC] p-3.5 transition-colors hover:border-[rgba(26,109,181,0.2)] hover:bg-white"
                >
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] bg-gradient-to-br text-[13px] font-semibold text-white ${AVATARS[i % AVATARS.length]}`}
                  >
                    {initials}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-xs font-medium text-[#0F172A]">
                      {u.prenom} {u.nom}
                    </div>
                    <div className="truncate text-[10px] text-[#64748B]">
                      {u.email} · #{u.matricule}
                    </div>
                  </div>
                  <div className="ml-auto flex items-center gap-2">
                    {u.estActif ? <Pill tone="green">Actif</Pill> : <Pill tone="gray">Inactif</Pill>}
                    <button
                      type="button"
                      aria-label="Gérer les rôles"
                      onClick={() => setManageUser(u)}
                      className="flex h-7 w-7 items-center justify-center rounded-[7px] text-[#94A3B8] transition-colors hover:bg-[#EFF6FF] hover:text-[#1A6DB5]"
                    >
                      <ShieldCheck className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label="Désactiver"
                      disabled={deleteUser.isPending}
                      onClick={() => setPendingDelete(u)}
                      className="flex h-7 w-7 items-center justify-center rounded-[7px] text-[#94A3B8] transition-colors hover:bg-[#FEF2F2] hover:text-[#EF4444]"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>
      <ConfirmDialog
        open={!!pendingDelete}
        variant="warning"
        title={pendingDelete ? `Désactiver l'utilisateur ${pendingDelete.matricule} ?` : ''}
        description={pendingDelete ? `${pendingDelete.prenom ?? ''} ${pendingDelete.nom ?? ''} ne pourra plus se connecter. Rien n'est supprimé définitivement.` : undefined}
        confirmLabel="Désactiver"
        busy={deleteUser.isPending}
        error={deleteUser.isError ? apiErrorMessage(deleteUser.error, 'Désactivation impossible') : undefined}
        onCancel={() => { setPendingDelete(null); deleteUser.reset(); }}
        onConfirm={() => { if (pendingDelete) deleteUser.mutate(pendingDelete.id, { onSuccess: () => setPendingDelete(null) }); }}
      />
    </div>
  );
}

export function UsersPage() {
  return (
    <RoleGuard allow={['SUPER_ADMIN', 'ADMINISTRATEUR']}>
      <UsersPageInner />
    </RoleGuard>
  );
}
