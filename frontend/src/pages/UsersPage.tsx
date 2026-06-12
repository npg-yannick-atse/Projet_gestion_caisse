import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, Plus, Search, ShieldCheck, Trash2, UserPlus, X } from 'lucide-react';
import {
  useUsers,
  useCreateUser,
  useDeleteUser,
  useUpdateUser,
  useUserAssignedRoles,
  useToggleUserRole,
  useUserProfils,
  useToggleUserProfil,
} from '@/api/users';
import { useProfils } from '@/api/profils';
import { useDirections } from '@/api/directions';
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

function UserRolesEditor({ user, onClose }: { user: User; onClose: () => void }) {
  const { data: roles } = useRoles();
  const { data: userRoles, isLoading } = useUserAssignedRoles(user.id);
  const toggle = useToggleUserRole(user.id);
  const assigned = useMemo(() => new Set((userRoles ?? []).map((r) => r.id)), [userRoles]);
  const { data: profils } = useProfils();
  const { data: userProfils } = useUserProfils(user.id);
  const toggleProfil = useToggleUserProfil(user.id);
  const assignedProfils = useMemo(() => new Set((userProfils ?? []).map((p) => p.id)), [userProfils]);
  const { data: directions } = useDirections();
  const updateUser = useUpdateUser();
  const currentUser = useAuthStore((s) => s.user);
  // Sécurité anti-lockout : un administrateur ne peut pas modifier ses propres rôles.
  // S'il a besoin de changer ses propres droits, un autre admin/super-admin doit le faire.
  const isSelf = currentUser?.id === user.id;

  return (
    <Panel>
      <PanelHeader
        title={
          <>
            Rôles —{' '}
            <span className="font-normal text-[#475569]">
              {user.prenom} {user.nom}
            </span>
          </>
        }
        badge={`${assigned.size}`}
      >
        <button
          type="button"
          aria-label="Fermer"
          onClick={onClose}
          className="ml-auto flex h-7 w-7 items-center justify-center rounded-[7px] text-[#94A3B8] transition-colors hover:bg-[#F8FAFC] hover:text-[#0F172A]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </PanelHeader>
      <div className="p-[18px]">
        {/* Rattachement : la direction n'est pas fournie par le LDAP, on l'attribue ici.
            Elle conditionne le périmètre des centres de coût visibles à la création de bon. */}
        <div className="mb-4 space-y-1.5">
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

        {/* Accès par plateforme : autorise la connexion au web et/ou au mobile.
            Verrouillé sur soi-même pour ne pas se bloquer hors de l'application. */}
        <div className="mb-4 border-t border-[rgba(15,76,129,0.07)] pt-3">
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

        {isLoading && <p className="text-sm text-[#64748B]">Chargement…</p>}

        {isSelf && (
          <div className="mb-3 flex items-start gap-2 rounded-[8px] border border-[#FECDCA] bg-[#FEF3F2] px-3 py-2 text-[12px] text-[#7F1D1D]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <strong className="font-semibold">Modification verrouillée.</strong> Vous ne pouvez pas
              modifier vos propres rôles. Demandez à un autre administrateur de le faire pour vous —
              cela évite de vous bloquer hors de l'application par erreur.
            </div>
          </div>
        )}

        <div className="space-y-1">
          {roles?.map((role) => {
            const has = assigned.has(role.id);
            return (
              <label
                key={role.id}
                className={`flex items-center gap-3 rounded-[7px] px-2 py-1.5 ${
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

        {/* Profils : paquets de permissions additionnels (s'ajoutent aux rôles). */}
        <div className="mt-4 border-t border-[rgba(15,76,129,0.07)] pt-3">
          <div className="mb-1.5 flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.7px] text-[#64748B]">
              Profils
            </span>
            <Pill tone="blue">{`${assignedProfils.size}`}</Pill>
          </div>
          <div className="space-y-1">
            {profils?.map((profil) => {
              const has = assignedProfils.has(profil.id);
              return (
                <label
                  key={profil.id}
                  className={`flex items-center gap-3 rounded-[7px] px-2 py-1.5 ${
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
        </div>

        <p className="mt-3 text-[11px] text-[#94A3B8]">
          Les permissions sont gérées depuis les écrans « Rôles » et « Profils ». Un utilisateur cumule
          les permissions de ses rôles ET de ses profils.
        </p>
      </div>
    </Panel>
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
  const [showPicker, setShowPicker] = useState(false);
  const [search, setSearch] = useState('');
  const [manageUser, setManageUser] = useState<User | null>(null);

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
      {manageUser && <UserRolesEditor user={manageUser} onClose={() => setManageUser(null)} />}

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
                      onClick={() => {
                        if (confirm(`Désactiver l'utilisateur ${u.matricule} ?`)) deleteUser.mutate(u.id);
                      }}
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
