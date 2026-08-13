import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, BadgeCheck, Building2, Copy, Globe, Plus, Search, Settings2, ShieldCheck, Tags, Trash2, UserPlus, Users2, X, type LucideIcon } from 'lucide-react';
import {
  useUsers,
  type StatutUtilisateur,
  useCreateUser,
  useDeleteUser,
  useUpdateUser,
  useUserAssignedRoles,
  useToggleUserRole,
  useUserProfils,
  useToggleUserProfil,
  useSetProfilEcheance,
  useUserDivisions,
  useToggleUserDivision,
  useUserNaturesOperation,
  useUserCostCenters,
  useToggleUserCostCenter,
  useToggleUserNatureOperation,
  useMyPermissions,
  useSetUserDivisions,
  useSetUserNaturesOperation,
  useSetUserCostCenters,
  useClonerDroits,
  type ResumeClonage,
} from '@/api/users';
import { useProfils, useGenererProfilDepuisUtilisateur } from '@/api/profils';
import { GenererDepuisModal } from '@/components/GenererDepuisModal';
import { useDirections } from '@/api/directions';
import { usePays, useDivisions, useNaturesOperation, useCostCenters } from '@/api/referentiel';
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
import { apiErrorMessage, libelleDivision } from '@/lib/utils';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import type { LdapUser, User } from '@/types/api';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { Button } from '@/components/ui/button';
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

type EditorTab = 'general' | 'roles' | 'profils' | 'divisions' | 'natures' | 'cost-centers';

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

/**
 * « Tout cocher / Tout décocher » pour un périmètre.
 *
 * L'action porte sur ce qui est VISIBLE, pas sur le catalogue entier : quand
 * une recherche est active, cocher tout doit cocher ce qu'on voit — sinon le
 * bouton ferait silencieusement bien plus que ce qu'il montre.
 *
 * Une seule requête porte la sélection complète : la faire élément par élément
 * sur 182 natures multiplierait les allers-retours et laisserait un état à
 * moitié appliqué au premier échec.
 */
function SelectionEnMasse({
  visibles,
  selection,
  enCours,
  onAppliquer,
  desactive,
}: {
  visibles: string[];
  selection: Set<string>;
  enCours: boolean;
  onAppliquer: (ids: string[]) => void;
  desactive?: boolean;
}) {
  const visiblesCoches = visibles.filter((id) => selection.has(id)).length;
  const toutCoche = visibles.length > 0 && visiblesCoches === visibles.length;

  const cocherTout = () => onAppliquer([...new Set([...selection, ...visibles])]);
  const decocherTout = () => onAppliquer([...selection].filter((id) => !visibles.includes(id)));

  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px]">
      <button
        type="button"
        disabled={desactive || enCours || visibles.length === 0 || toutCoche}
        onClick={cocherTout}
        className="rounded-[7px] border border-[rgba(15,76,129,0.15)] px-2 py-1 font-medium text-[#0F4C81] transition hover:bg-[#EFF6FF] disabled:opacity-40"
      >
        Tout cocher ({visibles.length})
      </button>
      <button
        type="button"
        disabled={desactive || enCours || visiblesCoches === 0}
        onClick={decocherTout}
        className="rounded-[7px] border border-[rgba(15,76,129,0.15)] px-2 py-1 font-medium text-[#475569] transition hover:bg-[#F1F5F9] disabled:opacity-40"
      >
        Tout décocher
      </button>
      <span className="text-[#94A3B8]">
        {enCours ? 'Enregistrement…' : `${selection.size} sélectionné${selection.size > 1 ? 's' : ''}`}
      </span>
    </div>
  );
}

/**
 * Recopier tous les droits d'un collègue sur cette personne.
 *
 * Le geste ANNONCE qu'il remplace : « les mêmes accès que X » ne veut pas dire
 * « les siens plus ceux de X », et un cumul silencieux laisserait des droits
 * résiduels que personne ne penserait à retirer.
 */
function ClonageModal({
  cible,
  onFermer,
}: {
  cible: User;
  onFermer: () => void;
}) {
  const { data: tous } = useUsers();
  const cloner = useClonerDroits(cible.id);
  const [recherche, setRecherche] = useState('');
  const [source, setSource] = useState<User | null>(null);
  const [resume, setResume] = useState<ResumeClonage | null>(null);

  const candidats = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return (tous ?? [])
      .filter((u) => String(u.id) !== String(cible.id))
      .filter((u) =>
        !q ? true : `${u.prenom} ${u.nom} ${u.matricule} ${u.email}`.toLowerCase().includes(q),
      )
      .slice(0, 30);
  }, [tous, recherche, cible.id]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center"
      onClick={onFermer}
    >
      <div className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <Panel>
          <PanelHeader title={`Recopier des droits sur ${cible.prenom} ${cible.nom}`} />

          {resume ? (
            <div className="space-y-3 p-[18px]">
              <p className="text-sm text-[#0F172A]">Droits recopiés :</p>
              <ul className="space-y-1 text-xs text-[#475569]">
                <li>{resume.roles} rôle(s)</li>
                <li>{resume.profils} profil(s)</li>
                <li>{resume.divisions} division(s)</li>
                <li>{resume.natures} nature(s)</li>
                <li>{resume.costCenters} centre(s) de coût</li>
              </ul>
              <p className="text-[11px] text-[#94A3B8]">
                La direction n'est pas recopiée : elle relève de l'organigramme, pas des droits.
              </p>
              <Button type="button" onClick={onFermer}>
                Fermer
              </Button>
            </div>
          ) : (
            <>
              <div className="space-y-2 p-[18px] pb-3">
                <div className="rounded-[9px] border border-[#FDE68A] bg-[#FFFBEB] p-3 text-[11px] text-[#92400E]">
                  Le périmètre actuel de {cible.prenom} sera <strong>remplacé</strong>, pas complété :
                  ses rôles, profils, divisions, natures et centres de coût deviendront exactement
                  ceux de la personne choisie.
                </div>
                <div className="flex items-center gap-2 rounded-[9px] border border-[rgba(15,76,129,0.1)] bg-[#F8FAFC] px-2.5 py-1.5">
                  <Search className="h-3.5 w-3.5 shrink-0 text-[#64748B]" />
                  <input
                    value={recherche}
                    onChange={(e) => setRecherche(e.target.value)}
                    placeholder="Chercher la personne à copier…"
                    className="flex-1 bg-transparent text-xs text-[#0F172A] outline-none"
                  />
                </div>
              </div>

              <div className="max-h-[40vh] overflow-y-auto border-y border-[rgba(15,76,129,0.07)]">
                {candidats.map((u) => (
                  <label
                    key={u.id}
                    className="flex cursor-pointer items-center gap-3 px-[18px] py-2 hover:bg-[#F8FAFC]"
                  >
                    <input
                      type="radio"
                      name="source-clonage"
                      checked={String(source?.id) === String(u.id)}
                      onChange={() => setSource(u)}
                      className="h-4 w-4"
                    />
                    <span className="text-xs">
                      <span className="font-medium text-[#0F172A]">
                        {u.prenom} {u.nom}
                      </span>{' '}
                      <span className="text-[#94A3B8]">#{u.matricule}</span>
                    </span>
                  </label>
                ))}
                {candidats.length === 0 && (
                  <p className="px-[18px] py-8 text-center text-sm text-[#64748B]">Aucun résultat.</p>
                )}
              </div>

              <div className="flex items-center gap-2 p-[18px]">
                <Button
                  type="button"
                  disabled={!source || cloner.isPending}
                  onClick={() =>
                    source && cloner.mutate(source.id, { onSuccess: (r) => setResume(r) })
                  }
                >
                  {cloner.isPending ? 'Copie…' : 'Recopier ces droits'}
                </Button>
                <Button type="button" variant="ghost" onClick={onFermer}>
                  Annuler
                </Button>
                {cloner.isError && (
                  <p className="text-sm text-destructive">
                    {apiErrorMessage(cloner.error, 'Copie impossible')}
                  </p>
                )}
              </div>
            </>
          )}
        </Panel>
      </div>
    </div>
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
  const [genererProfil, setGenererProfil] = useState(false);
  const [clonage, setClonage] = useState(false);
  const setDivisions = useSetUserDivisions(user.id);
  const setNatures = useSetUserNaturesOperation(user.id);
  const setCostCenters = useSetUserCostCenters(user.id);
  const genererDepuisUtilisateur = useGenererProfilDepuisUtilisateur();
  const { data: permissionsUtilisateur } = useMyPermissions(user.id);
  const setEcheance = useSetProfilEcheance(user.id);
  const assignedProfils = useMemo(() => new Set((userProfils ?? []).map((p) => p.id)), [userProfils]);
  // Accès division (restitutions)
  const { data: pays } = usePays();
  /**
   * Recherche des divisions PAR PAYS, exécutée en base : le serveur cherche
   * aussi dans le nom du pays, sans quoi taper « Côte d'Ivoire » ne trouverait
   * rien — une division s'appelle « SS11 », pas du nom de son pays.
   */
  const [divisionSearch, setDivisionSearch] = useState('');
  const [divisionSearchDebounced, setDivisionSearchDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDivisionSearchDebounced(divisionSearch), 300);
    return () => clearTimeout(t);
  }, [divisionSearch]);
  const { data: allDivisions } = useDivisions(undefined, {
    search: divisionSearchDebounced.trim() || undefined,
  });
  const { data: userDivisions } = useUserDivisions(user.id);
  const toggleDivision = useToggleUserDivision(user.id);
  const divisionAccess = useMemo(() => new Set(userDivisions ?? []), [userDivisions]);
  /**
   * Divisions à plat, chacune portant le nom de son pays, triées par pays.
   * L'ordre vient d'ici et non de la base : les deux listes arrivent séparément
   * et c'est leur APPARIEMENT qui doit être ordonné, pas chacune de son côté.
   */
  const divisionsParPays = useMemo(() => {
    const nomParPays = new Map((pays ?? []).map((p) => [String(p.id), p.libelle]));
    return (allDivisions ?? [])
      .map((division) => ({ division, pays: nomParPays.get(String(division.paysId)) ?? '—' }))
      .sort((a, b) => a.pays.localeCompare(b.pays, 'fr'));
  }, [allDivisions, pays]);
  // Natures d'opération autorisées (création de bons)
  const { data: userNatures } = useUserNaturesOperation(user.id);
  const toggleNature = useToggleUserNatureOperation(user.id);
  const natureAccess = useMemo(() => new Set(userNatures ?? []), [userNatures]);
  // Centres de coût accordés EN PROPRE — ceux de la direction s'y ajoutent
  // automatiquement et n'apparaissent donc pas cochés ici.
  const { data: allCostCenters } = useCostCenters();
  const { data: userCostCenters } = useUserCostCenters(user.id);
  const toggleCostCenter = useToggleUserCostCenter(user.id);
  const costCenterAccess = useMemo(() => new Set(userCostCenters ?? []), [userCostCenters]);

  /**
   * Le référentiel compte ~181 natures : sans recherche, il fallait parcourir
   * autant de cases pour en cocher une.
   *
   * La recherche ET le tri sont exécutés EN BASE, comme partout ailleurs dans
   * l'application. Une première version filtrait la liste déjà chargée en
   * JavaScript : plus court à écrire, mais c'est précisément ce que la
   * convention interdit — le jour où le référentiel grossit, l'écran rapatrie
   * tout pour n'en afficher que trois lignes.
   */
  const [natureSearch, setNatureSearch] = useState('');
  const [natureSearchDebounced, setNatureSearchDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setNatureSearchDebounced(natureSearch), 300);
    return () => clearTimeout(t);
  }, [natureSearch]);

  const { data: allNatures } = useNaturesOperation({
    search: natureSearchDebounced.trim() || undefined,
    sortBy: 'libelle',
    sortDir: 'asc',
  });
  const naturesAffichees = allNatures ?? [];
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
      {genererProfil && (
        <GenererDepuisModal
          titre="Générer un profil depuis cet utilisateur"
          sourceLibelle={`${user.prenom} ${user.nom}`}
          nbPermissions={permissionsUtilisateur?.length ?? 0}
          avertissement="Seules les PERMISSIONS sont recopiées, et uniquement les siennes : ce qu'il exerce au titre d'un intérim est temporaire et n'est pas repris. Ni les rôles, ni les périmètres — direction, caisses, portefeuilles, centres de coût, natures et divisions restent attachés à la personne."
          pending={genererDepuisUtilisateur.isPending}
          error={genererDepuisUtilisateur.error}
          onValider={(code, libelle) =>
            genererDepuisUtilisateur.mutate(
              { userId: user.id, code, libelle },
              { onSuccess: () => setGenererProfil(false) },
            )
          }
          onClose={() => setGenererProfil(false)}
        />
      )}
      {clonage && <ClonageModal cible={user} onFermer={() => setClonage(false)} />}
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

          {/* En-tête plutôt que dans l'onglet Profils : le geste porte sur la
              PERSONNE entière, pas sur ses profils. Le cacher derrière un onglet
              le rendait introuvable. */}
          <button
            type="button"
            onClick={() => setGenererProfil(true)}
            title="Créer un profil réutilisable à partir des droits de cette personne"
            className="ml-auto flex shrink-0 items-center gap-1.5 rounded-[9px] border border-[rgba(15,76,129,0.12)] bg-white px-3 py-1.5 text-[11px] font-medium text-[#0F4C81] transition hover:bg-[#EFF6FF]"
          >
            <Copy className="h-3.5 w-3.5" /> Générer un profil
          </button>

          {/* Clonage complet : un profil ne peut pas transporter les périmètres,
              seul un geste utilisateur → utilisateur le peut. */}
          <button
            type="button"
            disabled={isSelf}
            onClick={() => setClonage(true)}
            title={
              isSelf
                ? 'Vous ne pouvez pas recopier des droits sur vous-même'
                : 'Recopier les rôles, profils et périmètres d’un collègue'
            }
            className="flex shrink-0 items-center gap-1.5 rounded-[9px] border border-[rgba(15,76,129,0.12)] bg-white px-3 py-1.5 text-[11px] font-medium text-[#0F4C81] transition hover:bg-[#EFF6FF] disabled:opacity-40"
          >
            <Users2 className="h-3.5 w-3.5" /> Cloner un utilisateur
          </button>

          <button
            type="button"
            aria-label="Fermer"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] text-[#94A3B8] transition-colors hover:bg-white hover:text-[#0F172A]"
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
          <TabBtn active={tab === 'cost-centers'} onClick={() => setTab('cost-centers')} icon={Building2} label="Centres de coût" count={costCenterAccess.size} />
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
                const attribue = (userProfils ?? []).find((p) => p.id === profil.id);
                const has = !!attribue;
                return (
                  <div key={profil.id} className="rounded-[7px] px-2 py-2 hover:bg-[#F8FAFC]">
                    <label
                      className={`flex items-center gap-3 ${
                        isSelf ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
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
                        {attribue?.statut === 'EXPIRE' && (
                          <span className="ml-1 rounded-full bg-[#FEF3F2] px-1.5 py-0.5 text-[9px] font-semibold text-[#B42318]">
                            Expiré
                          </span>
                        )}
                        {attribue?.statut === 'A_VENIR' && (
                          <span className="ml-1 rounded-full bg-[#FFFBEB] px-1.5 py-0.5 text-[9px] font-semibold text-[#B45309]">
                            À venir
                          </span>
                        )}
                      </span>
                    </label>

                    {/* Échéance : visible seulement quand le profil est attribué.
                        Vide = permanent, ce qui reste le cas par défaut. */}
                    {has && !isSelf && (
                      <div className="ml-7 mt-1.5 flex items-center gap-2">
                        <label className="text-[11px] text-[#64748B]" htmlFor={`fin-${profil.id}`}>
                          Jusqu’au
                        </label>
                        <input
                          id={`fin-${profil.id}`}
                          type="date"
                          value={attribue?.dateFin ? String(attribue.dateFin).slice(0, 10) : ''}
                          disabled={setEcheance.isPending}
                          onChange={(e) =>
                            setEcheance.mutate({
                              profilId: profil.id,
                              dateFin: e.target.value ? new Date(`${e.target.value}T23:59:59`).toISOString() : null,
                            })
                          }
                          className="h-7 rounded-[7px] border border-[rgba(15,76,129,0.15)] bg-white px-2 text-[11px] text-[#0F172A] outline-none focus:border-[#1A6DB5]"
                        />
                        <span className="text-[11px] text-[#94A3B8]">
                          {attribue?.dateFin ? 'Le profil s’éteindra seul.' : 'Vide = sans limite de temps.'}
                        </span>
                      </div>
                    )}
                  </div>
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
              <div className="flex items-center gap-2 rounded-[9px] border border-[rgba(15,76,129,0.1)] bg-[#F8FAFC] px-2.5 py-1.5">
                <Search className="h-3.5 w-3.5 shrink-0 text-[#64748B]" />
                <input
                  value={divisionSearch}
                  onChange={(e) => setDivisionSearch(e.target.value)}
                  placeholder="Rechercher un pays ou une division…"
                  className="flex-1 bg-transparent text-xs text-[#0F172A] outline-none"
                />
                <span className="shrink-0 text-[10px] text-[#94A3B8]">{divisionsParPays.length}</span>
              </div>

              <SelectionEnMasse
                visibles={divisionsParPays.map((d) => String(d.division.id))}
                selection={divisionAccess}
                enCours={setDivisions.isPending}
                desactive={isSelf}
                onAppliquer={(ids) => setDivisions.mutate(ids)}
              />

              {/* Une ligne par division, le PAYS porté par l'étiquette.
                  Grouper par pays produisait un en-tête par pays pour une seule
                  division en dessous — 71 titres, 71 cases isolées.
                  UNE seule colonne : sur deux, un nom de pays long débordait de
                  sa moitié et poussait une barre de défilement horizontale. */}
              <div className="max-h-[300px] space-y-0.5 overflow-y-auto">
                {divisionsParPays.map(({ division, pays: nomPays }) => {
                  const has = divisionAccess.has(division.id);
                  return (
                    <label
                      key={division.id}
                      className="flex cursor-pointer items-center gap-2 rounded-[7px] px-2 py-1 hover:bg-[#F8FAFC]"
                    >
                      <input
                        type="checkbox"
                        checked={has}
                        disabled={toggleDivision.isPending}
                        onChange={() => toggleDivision.mutate({ divisionId: division.id, has })}
                        className="h-4 w-4"
                      />
                      <span className="truncate text-xs text-[#0F172A]" title={nomPays}>
                        {nomPays}
                        <span className="ml-1.5 text-[#94A3B8]">{libelleDivision(division)}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
              {divisionsParPays.length === 0 &&
                (divisionSearchDebounced.trim() ? (
                  <p className="text-xs text-[#64748B]">
                    Aucun pays ne correspond à « {divisionSearchDebounced} ».
                  </p>
                ) : (
                  <p className="text-sm text-[#64748B]">
                    Aucune division. Créez-en depuis « Pays &amp; Divisions ».
                  </p>
                ))}
            </div>
          )}

          {/* -------- Natures d'opération autorisées (création de bons) -------- */}
          {/* -------- Centres de coût accordés en propre -------- */}
          {tab === 'cost-centers' && (
            <div className="space-y-2">
              <p className="mb-1 text-[11px] text-[#94A3B8]">
                Centres de coût accordés <strong>en plus</strong> de ceux de sa direction.
                Un utilisateur peut déjà imputer tous les centres rattachés à sa direction :
                inutile de les cocher ici, ils ne s'y affichent pas.
              </p>

              <SelectionEnMasse
                visibles={(allCostCenters ?? []).map((cc) => String(cc.id))}
                selection={costCenterAccess}
                enCours={setCostCenters.isPending}
                desactive={isSelf}
                onAppliquer={(ids) => setCostCenters.mutate(ids)}
              />

              <div className="grid max-h-[320px] grid-cols-2 gap-1 overflow-y-auto">
                {(allCostCenters ?? []).map((cc) => {
                  const has = costCenterAccess.has(cc.id);
                  return (
                    <label
                      key={cc.id}
                      className="flex cursor-pointer items-center gap-2 rounded-[7px] px-2 py-1 hover:bg-[#F8FAFC]"
                    >
                      <input
                        type="checkbox"
                        checked={has}
                        disabled={toggleCostCenter.isPending}
                        onChange={() => toggleCostCenter.mutate({ costCenterId: cc.id, has })}
                        className="h-4 w-4"
                      />
                      <span className="text-xs text-[#0F172A]">{cc.libelle}</span>
                    </label>
                  );
                })}
              </div>
              {(allCostCenters ?? []).length === 0 && (
                <p className="text-xs text-[#64748B]">Aucun centre de coût dans le référentiel.</p>
              )}
            </div>
          )}

          {tab === 'natures' && (
            <div className="space-y-2">
              <p className="mb-1 text-[11px] text-[#94A3B8]">
                Limite les natures comptables utilisables à la création d'un bon.{' '}
                <strong>Sans aucune coche, l'utilisateur ne peut créer aucun bon</strong> (les administrateurs ne sont pas concernés).
              </p>
              <div className="flex items-center gap-2 rounded-[9px] border border-[rgba(15,76,129,0.1)] bg-[#F8FAFC] px-2.5 py-1.5">
                <Search className="h-3.5 w-3.5 shrink-0 text-[#64748B]" />
                <input
                  value={natureSearch}
                  onChange={(e) => setNatureSearch(e.target.value)}
                  placeholder="Rechercher par code ou libellé…"
                  className="flex-1 bg-transparent text-xs text-[#0F172A] outline-none"
                />
                {/* La base ne renvoie QUE les lignes correspondantes : il n'y a
                    plus de « x sur n » à afficher, seulement ce qui remonte. */}
                <span className="shrink-0 text-[10px] text-[#94A3B8]">
                  {naturesAffichees.length}
                </span>
              </div>

              <SelectionEnMasse
                visibles={naturesAffichees.map((n) => String(n.id))}
                selection={natureAccess}
                enCours={setNatures.isPending}
                desactive={isSelf}
                onAppliquer={(ids) => setNatures.mutate(ids)}
              />

              {/* Hauteur bornée : la liste complète poussait le reste du panneau
                  hors de l'écran et masquait les cases déjà cochées. */}
              <div className="grid max-h-[320px] grid-cols-2 gap-1 overflow-y-auto">
                {naturesAffichees.map((n) => {
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
              {/* Une liste vide ne veut pas dire la même chose selon qu'on
                  cherche ou non : référentiel vide d'un côté, recherche
                  infructueuse de l'autre. */}
              {naturesAffichees.length === 0 &&
                (natureSearchDebounced.trim() ? (
                  <p className="text-xs text-[#64748B]">
                    Aucune nature ne correspond à « {natureSearchDebounced} ».
                  </p>
                ) : (
                  <p className="text-sm text-[#64748B]">
                    Aucune nature d'opération. Créez-en depuis « Natures d'opération ».
                  </p>
                ))}
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
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Statut initialisé depuis l'URL, comme le tri : la tuile « Inactifs » du
  // tableau de bord y arrive avec ?statut=INACTIF. Sans ça, elle menait à la
  // liste complète, donc majoritairement active.
  const [statut, setStatut] = useState<'' | StatutUtilisateur>(() => {
    const v = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '').get(
      'statut',
    );
    return v === 'ACTIF' || v === 'INACTIF' ? v : '';
  });

  // Recherche (nom, prénom, matricule, email), statut et tri exécutés EN BASE.
  const { data: users, isLoading, isError } = useUsers({
    search: debouncedSearch || undefined,
    statut: statut || undefined,
    sortBy: sort.state.by ?? undefined,
    sortDir: sort.state.by ? sort.state.dir : undefined,
  });
  const deleteUser = useDeleteUser();
  const [pendingDelete, setPendingDelete] = useState<User | null>(null);
  const [showPicker, setShowPicker] = useState(false);
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

  const filtered = users ?? [];

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

          <select
            value={statut}
            onChange={(e) => setStatut(e.target.value as '' | StatutUtilisateur)}
            aria-label="Filtrer par statut"
            className="rounded-[9px] border border-[rgba(15,76,129,0.1)] bg-[#F8FAFC] px-2 py-1.5 text-[11px] text-[#0F172A] outline-none focus:border-[#1A6DB5]"
          >
            <option value="">Tous les statuts</option>
            <option value="ACTIF">Actifs</option>
            <option value="INACTIF">Inactifs</option>
          </select>

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
