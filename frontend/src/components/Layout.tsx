import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, Outlet, useNavigate, useRouterState } from '@tanstack/react-router';
import {
  ArrowLeftRight,
  ArrowRightLeft,
  Activity,
  BadgeCheck,
  Bell,
  BellOff,
  BookOpen,
  Tags,
  Briefcase,
  Building2,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Clock,
  Coins,
  BookText,
  History,
  Landmark,
  LayoutDashboard,
  LogOut,
  Network,
  Plus,
  Receipt,
  TrendingUp,
  Repeat,
  Settings,
  ShieldCheck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { useMe } from '@/api/auth';
import { useBons } from '@/api/bons';
import { useUserRoles, useMyPermissions } from '@/api/users';
import { cn, formatMontant } from '@/lib/utils';
import type { RoleCode } from '@/types/api';
import { PersonaTabs } from '@/components/PersonaTabs';
import {
  useNotificationsStore,
  bonNotifKey,
  rechargeNotifKey,
  transfertNotifKey,
} from '@/stores/notifications.store';
import { useDemandesRecharge } from '@/api/demandesRecharge';
import { useDemandesTransfert } from '@/api/demandesTransfert';

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  return `il y a ${d} j`;
}

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  exact: boolean;
  roles?: RoleCode[];
  /** Visible aussi si l'utilisateur détient cette permission (en plus des rôles). */
  permission?: string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Principal',
    items: [
      { to: '/', label: 'Tableau de bord', icon: LayoutDashboard, exact: true },
      { to: '/caisses', label: 'Caisses & Portefeuilles', icon: Landmark, exact: false, roles: ['SUPER_ADMIN', 'ADMINISTRATEUR', 'CAISSIER'] },
      { to: '/recharge', label: 'Recharge', icon: ArrowLeftRight, exact: false, roles: ['SUPER_ADMIN', 'ADMINISTRATEUR', 'CAISSIER'] },
      { to: '/demandes-recharge', label: 'Demandes de recharge', icon: Coins, exact: false, roles: ['SUPER_ADMIN', 'ADMINISTRATEUR', 'CAISSIER', 'VALIDATEUR', 'GESTIONNAIRE_PORTEFEUILLE'] },
      { to: '/transferts', label: 'Transferts', icon: ArrowRightLeft, exact: false, roles: ['SUPER_ADMIN', 'ADMINISTRATEUR', 'CAISSIER', 'GESTIONNAIRE_PORTEFEUILLE'] },
      { to: '/operations', label: 'Opérations', icon: Activity, exact: false, roles: ['SUPER_ADMIN', 'ADMINISTRATEUR', 'CAISSIER', 'VALIDATEUR'] },
    ],
  },
  {
    title: 'Gestion',
    items: [
      { to: '/bons', label: 'Bons', icon: Receipt, exact: false },
      { to: '/bons-manuels', label: 'Bons manuels', icon: BookText, exact: false, roles: ['SUPER_ADMIN', 'ADMINISTRATEUR', 'CAISSIER', 'DAF'] },
      { to: '/extensions', label: "Demandes d'extension", icon: TrendingUp, exact: false, roles: ['SUPER_ADMIN', 'ADMINISTRATEUR'], permission: 'EXTENSION_APPROUVER' },
      { to: '/users', label: 'Utilisateurs', icon: Users, exact: false, roles: ['SUPER_ADMIN', 'ADMINISTRATEUR'] },
      { to: '/roles', label: 'Rôles', icon: ShieldCheck, exact: false, roles: ['SUPER_ADMIN', 'ADMINISTRATEUR'] },
      { to: '/profils', label: 'Profils', icon: BadgeCheck, exact: false, roles: ['SUPER_ADMIN', 'ADMINISTRATEUR'] },
      { to: '/interims', label: 'Intérims', icon: Repeat, exact: false, roles: ['SUPER_ADMIN', 'ADMINISTRATEUR'] },
      { to: '/audit', label: 'Audit', icon: History, exact: false, roles: ['SUPER_ADMIN'] },
    ],
  },
  {
    title: 'Référentiel',
    items: [
      { to: '/directions', label: 'Directions', icon: Network, exact: false, roles: ['SUPER_ADMIN', 'ADMINISTRATEUR'] },
      { to: '/partenaires', label: 'Partenaires', icon: Building2, exact: false, roles: ['SUPER_ADMIN', 'ADMINISTRATEUR'] },
      { to: '/cost-centers', label: 'Centres de coût', icon: Briefcase, exact: false, roles: ['SUPER_ADMIN', 'ADMINISTRATEUR'] },
      { to: '/natures-operation', label: "Natures d'opération", icon: Tags, exact: false, roles: ['SUPER_ADMIN', 'ADMINISTRATEUR'] },
      { to: '/plan-comptable', label: 'Plan comptable', icon: BookOpen, exact: false, roles: ['SUPER_ADMIN', 'ADMINISTRATEUR'] },
    ],
  },
];

const FLAT_ALL = NAV_SECTIONS.flatMap((s) => s.items);

function visibleFor(item: NavItem, codes: Set<RoleCode>, perms: Set<string>): boolean {
  if (item.permission && perms.has(item.permission)) return true;
  if (!item.roles || item.roles.length === 0) return true;
  return item.roles.some((r) => codes.has(r));
}

function titleFor(pathname: string): string {
  if (pathname === '/') return 'Tableau de bord';
  const item = FLAT_ALL.filter((i) => i.to !== '/').find((i) => pathname.startsWith(i.to));
  return item?.label ?? 'Fond de Caisse';
}

const SIDEBAR_STORAGE_KEY = 'fdc.sidebar.collapsed';

export function Layout() {
  const navigate = useNavigate();
  const { user, setUser, logout } = useAuthStore();
  const meQuery = useMe(!user);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: bons } = useBons();
  const readSet = useNotificationsStore((s) => s.read);
  const markRead = useNotificationsStore((s) => s.markRead);
  const markAllRead = useNotificationsStore((s) => s.markAllRead);

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === '1';
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, collapsed ? '1' : '0');
  }, [collapsed]);

  const { data: userRoles } = useUserRoles(user?.id ?? null);
  const roleCodes = useMemo(() => new Set<RoleCode>((userRoles ?? []).map((r) => r.code)), [userRoles]);
  const { data: myPermissions } = useMyPermissions(user?.id ?? null);
  const permCodes = useMemo(() => new Set<string>(myPermissions ?? []), [myPermissions]);

  // Périmètres de notification selon le rôle.
  const isAdminRole = roleCodes.has('SUPER_ADMIN') || roleCodes.has('ADMINISTRATEUR');
  const canValidate = roleCodes.has('VALIDATEUR') || isAdminRole;
  const canSeeRecharge = roleCodes.has('CAISSIER') || isAdminRole;
  const canApproveTransfert = roleCodes.has('GESTIONNAIRE_PORTEFEUILLE') || isAdminRole;
  const canExecuteTransfert =
    roleCodes.has('CAISSIER') || roleCodes.has('GESTIONNAIRE_PORTEFEUILLE') || isAdminRole;

  const { data: demandesRecharge } = useDemandesRecharge('EN_ATTENTE');
  const { data: demandesTransfert } = useDemandesTransfert();

  // Notifications (popover) — liste unifiée : bons à valider + recharges + transferts à traiter.
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement | null>(null);
  const notifItems = useMemo(() => {
    type Tone = 'amber' | 'green' | 'blue';
    const items: Array<{
      key: string;
      kind: 'bon' | 'recharge' | 'transfert';
      id: string;
      title: string;
      montant: string;
      createdAt: string;
      badge: string;
      tone: Tone;
    }> = [];

    if (canValidate) {
      for (const b of bons ?? []) {
        if (b.statut === 'CREE') {
          items.push({
            key: bonNotifKey(b.id),
            kind: 'bon',
            id: b.id,
            title: `Bon à valider — ${b.numero}`,
            montant: b.montantTotal,
            createdAt: b.createdAt,
            badge: 'En attente',
            tone: 'amber',
          });
        }
      }
    }

    if (canSeeRecharge) {
      for (const d of demandesRecharge ?? []) {
        if (d.statut === 'EN_ATTENTE') {
          items.push({
            key: rechargeNotifKey(d.id),
            kind: 'recharge',
            id: d.id,
            title: `Recharge à traiter — ${d.numero}`,
            montant: d.montant,
            createdAt: d.createdAt,
            badge: 'À traiter',
            tone: 'green',
          });
        }
      }
    }

    for (const t of demandesTransfert ?? []) {
      if (t.statut === 'CREE' && canApproveTransfert) {
        items.push({
          key: transfertNotifKey(t.id, t.statut),
          kind: 'transfert',
          id: t.id,
          title: `Transfert à approuver — ${t.numero}`,
          montant: t.montant,
          createdAt: t.createdAt,
          badge: 'À approuver',
          tone: 'blue',
        });
      } else if (t.statut === 'APPROUVEE' && canExecuteTransfert) {
        items.push({
          key: transfertNotifKey(t.id, t.statut),
          kind: 'transfert',
          id: t.id,
          title: `Transfert à exécuter — ${t.numero}`,
          montant: t.montant,
          createdAt: t.createdAt,
          badge: 'À exécuter',
          tone: 'blue',
        });
      }
    }

    return items
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 12);
  }, [bons, demandesRecharge, demandesTransfert, canValidate, canSeeRecharge, canApproveTransfert, canExecuteTransfert]);
  const unreadCount = useMemo(
    () => notifItems.filter((n) => !readSet.has(n.key)).length,
    [notifItems, readSet],
  );

  // --- Notifications navigateur (Niveau 1) ---

  // 1) Polling : rafraîchit les sources de notifications toutes les 30 s.
  const queryClient = useQueryClient();
  useEffect(() => {
    const id = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ['bons'] });
      queryClient.invalidateQueries({ queryKey: ['demandes-recharge'] });
      queryClient.invalidateQueries({ queryKey: ['demandes-transfert'] });
      // Rôles effectifs : reflète le début / la fin d'un intérim sans rechargement manuel.
      if (user?.id) queryClient.invalidateQueries({ queryKey: ['user', user.id, 'roles'] });
    }, 30000);
    return () => clearInterval(id);
  }, [queryClient, user?.id]);

  // 2) Autorisation des notifications système. État + activation par clic (plus fiable
  //    que l'auto-demande, surtout sur certains navigateurs / contextes non sécurisés).
  const [notifPerm, setNotifPerm] = useState<string>(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported',
  );
  const enableDesktopNotifs = () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setNotifPerm('unsupported');
      return;
    }
    Notification.requestPermission()
      .then((p) => {
        setNotifPerm(p);
        if (p === 'granted') {
          try {
            new Notification('Fond de Caisse — NPG Gandour', { body: 'Notifications activées ✅' });
          } catch {
            /* contexte non sécurisé : le constructeur peut échouer */
            setNotifPerm('unsupported');
          }
        }
      })
      .catch(() => undefined);
  };
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
        .then((p) => setNotifPerm(p))
        .catch(() => undefined);
    }
  }, []);

  // 3) À chaque NOUVELLE notification non lue → pop-up système (si autorisé).
  const knownNotifKeys = useRef<Set<string> | null>(null);
  useEffect(() => {
    const current = new Set(notifItems.map((n) => n.key));
    // Premier passage : on amorce sans notifier (évite un flot au chargement).
    if (knownNotifKeys.current === null) {
      knownNotifKeys.current = current;
      return;
    }
    const prev = knownNotifKeys.current;
    knownNotifKeys.current = current;

    if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') {
      return;
    }
    const fresh = notifItems.filter((n) => !prev.has(n.key) && !readSet.has(n.key));
    for (const n of fresh.slice(0, 3)) {
      try {
        const sysNotif = new Notification('Fond de Caisse — NPG Gandour', {
          body: `${n.title} · ${formatMontant(n.montant)}`,
          tag: n.key,
        });
        sysNotif.onclick = () => {
          window.focus();
          if (n.kind === 'recharge') navigate({ to: '/demandes-recharge' });
          else if (n.kind === 'transfert') navigate({ to: '/transferts' });
          else navigate({ to: '/bons/$bonId', params: { bonId: n.id } });
          sysNotif.close();
        };
      } catch {
        // Notification non disponible / bloquée : on ignore silencieusement.
      }
    }
  }, [notifItems, readSet, navigate]);

  useEffect(() => {
    if (!notifOpen) return;
    const onDown = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNotifOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [notifOpen]);

  const navSections = useMemo(() => {
    return NAV_SECTIONS.map((section) => ({
      ...section,
      items: section.items.filter((item) => visibleFor(item, roleCodes, permCodes)),
    })).filter((s) => s.items.length > 0);
  }, [roleCodes, permCodes]);

  const flatNav = useMemo(() => navSections.flatMap((s) => s.items), [navSections]);

  useEffect(() => {
    if (meQuery.data) setUser(meQuery.data);
  }, [meQuery.data, setUser]);

  useEffect(() => {
    if (meQuery.isError) {
      logout();
      navigate({ to: '/login' });
    }
  }, [meQuery.isError, logout, navigate]);

  const handleLogout = () => {
    logout();
    navigate({ to: '/login' });
  };

  const initials = `${user?.prenom?.[0] ?? ''}${user?.nom?.[0] ?? ''}`.toUpperCase() || '?';
  const title = titleFor(pathname);
  const isAdmin = roleCodes.has('SUPER_ADMIN') || roleCodes.has('ADMINISTRATEUR');

  return (
    <div className="flex min-h-screen bg-[#F1F5F9] text-[#0F172A]">
      {/* Sidebar (desktop) */}
      <aside
        className={cn(
          'relative hidden shrink-0 flex-col bg-[#0A1628] transition-[width] duration-200 ease-out md:flex',
          collapsed ? 'w-[76px]' : 'w-[260px]',
        )}
      >
        <div className="pointer-events-none absolute -left-20 -top-20 h-[250px] w-[250px] overflow-hidden rounded-full bg-[radial-gradient(circle,rgba(0,200,150,0.15)_0%,transparent_70%)]" />

        {/* Bouton de pliage */}
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          aria-label={collapsed ? 'Déplier le menu' : 'Replier le menu'}
          title={collapsed ? 'Déplier le menu' : 'Replier le menu'}
          className="group absolute right-[-18px] top-6 z-30 flex h-9 w-9 items-center justify-center rounded-full border-2 border-[#0A1628] bg-[#00C896] text-[#0A1628] shadow-[0_6px_16px_rgba(0,200,150,0.55)] transition-all hover:scale-110 hover:bg-white"
        >
          {collapsed ? <ChevronRight className="h-4 w-4 stroke-[2.5]" /> : <ChevronLeft className="h-4 w-4 stroke-[2.5]" />}
        </button>

        <div
          className={cn(
            'relative border-b border-white/[0.06] pb-5 pt-6 transition-[padding] duration-200',
            collapsed ? 'px-3' : 'px-5',
          )}
        >
          <div
            className={cn(
              'flex h-11 w-11 items-center justify-center rounded-[11px] bg-gradient-to-br from-[#00C896] to-[#0F4C81] text-[18px] font-bold tracking-tight text-white',
              collapsed ? 'mx-auto' : 'mb-3',
            )}
          >
            FC
          </div>
          {!collapsed && (
            <>
              <div className="font-display text-base font-semibold text-white">Fond de Caisse</div>
              <div className="mt-0.5 text-xs text-white/40">NPG Gandour</div>
            </>
          )}
        </div>

        <nav className={cn('relative flex-1 overflow-y-auto py-4', collapsed ? 'px-2' : 'px-3')}>
          {navSections.map((section) => (
            <div key={section.title} className="mb-1">
              {collapsed ? (
                <div className="mx-2 my-3 h-px bg-white/10 first:mt-1" />
              ) : (
                <div className="px-3 pb-2 pt-4 text-[11px] font-semibold uppercase tracking-[1.5px] text-white/35">
                  {section.title}
                </div>
              )}
              <div className="space-y-0.5">
                {section.items.map((item) => (
                  <Link key={item.to} to={item.to} activeOptions={{ exact: item.exact }}>
                    {({ isActive }) => (
                      <span
                        title={collapsed ? item.label : undefined}
                        className={cn(
                          'relative flex items-center rounded-[10px] text-sm transition-colors',
                          collapsed ? 'justify-center px-2 py-3' : 'gap-3.5 px-3.5 py-3',
                          isActive
                            ? 'bg-[#00C896]/[0.14] font-medium text-[#00C896]'
                            : 'text-white/55 hover:bg-white/[0.06] hover:text-white/90',
                        )}
                      >
                        {isActive && (
                          <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r bg-[#00C896]" />
                        )}
                        <item.icon className="h-5 w-5 shrink-0" />
                        {!collapsed && item.label}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div
          className={cn(
            'relative flex items-center border-t border-white/[0.06] p-4 transition-[gap] duration-200',
            collapsed ? 'flex-col gap-3' : 'gap-3',
          )}
        >
          <div
            title={collapsed && user ? `${user.prenom} ${user.nom}` : undefined}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[11px] bg-gradient-to-br from-[#0F4C81] to-[#00C896] text-sm font-semibold text-white"
          >
            {initials}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-white">
                {user ? `${user.prenom} ${user.nom}` : '—'}
              </div>
              <div className="text-xs text-white/40">#{user?.matricule}</div>
            </div>
          )}
          <button
            type="button"
            onClick={handleLogout}
            aria-label="Déconnexion"
            title="Déconnexion"
            className="flex h-8 w-8 items-center justify-center rounded-[10px] text-white/40 transition-colors hover:bg-white/10 hover:text-white"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>

      {/* Contenu */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="flex h-[60px] shrink-0 items-center gap-3 border-b border-[rgba(15,76,129,0.1)] bg-white px-4 sm:px-7">
          <img src="/logo-npg.png" alt="NPG" className="h-7 w-7 object-contain md:hidden" />
          <div className="font-display text-[15px] font-semibold text-[#0F172A]">{title}</div>
          {/* Pilules de bascule entre tableaux de bord : uniquement sur le tableau de bord
              (changer de persona n'a de sens que là). Masquées sur les autres pages. */}
          {pathname === '/' && <PersonaTabs />}
          <div className="ml-auto flex items-center gap-2.5">
            <div ref={notifRef} className="relative">
              <button
                type="button"
                aria-haspopup="dialog"
                title={unreadCount > 0 ? `${unreadCount} notification(s) non lue(s)` : 'Aucune notification non lue'}
                onClick={() => setNotifOpen((v) => !v)}
                className={cn(
                  'relative flex h-[34px] w-[34px] items-center justify-center rounded-[10px] border border-[rgba(15,76,129,0.1)] bg-white text-[#475569] transition-colors hover:bg-[#E8F2FF] hover:text-[#1A6DB5]',
                  notifOpen && 'bg-[#E8F2FF] text-[#1A6DB5]',
                )}
              >
                <Bell className="h-[17px] w-[17px]" />
                {unreadCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#EF4444] px-1 text-[9px] font-semibold leading-none text-white">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div
                  role="dialog"
                  className="absolute right-0 top-[calc(100%+8px)] z-50 w-[360px] overflow-hidden rounded-[14px] border border-[rgba(15,76,129,0.12)] bg-white shadow-[0_12px_32px_rgba(15,23,42,0.18)]"
                >
                  {/* En-tête */}
                  <div className="flex items-center gap-2.5 border-b border-[rgba(15,76,129,0.08)] bg-[#F8FAFC] px-4 py-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[#EFF6FF] text-[#1A6DB5]">
                      <Bell className="h-4 w-4" />
                    </div>
                    <div className="flex-1">
                      <div className="font-display text-[13px] font-semibold text-[#0F172A]">
                        Notifications
                      </div>
                    </div>
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={() => markAllRead(notifItems.map((n) => n.key))}
                        title="Tout marquer comme lu"
                        className="inline-flex items-center gap-1 rounded-[7px] bg-white px-2 py-1 text-[10px] font-medium text-[#1A6DB5] transition-colors hover:bg-[#E8F2FF]"
                      >
                        <CheckCheck className="h-3 w-3" />
                        Tout lire
                      </button>
                    )}
                  </div>

                  {/* Bandeau d'activation des notifications bureau */}
                  {notifPerm !== 'granted' && (
                    <div className="flex items-center gap-2 border-b border-[rgba(15,76,129,0.08)] bg-[#FFFBEB] px-4 py-2.5 text-[11px] text-[#92400E]">
                      <span className="flex-1">
                        {notifPerm === 'denied'
                          ? 'Notifications bureau bloquées : autorisez-les dans les réglages du site (cadenas → Notifications).'
                          : notifPerm === 'unsupported'
                            ? 'Notifications bureau indisponibles ici (accès non sécurisé : HTTPS ou localhost requis).'
                            : "Activez les notifications bureau pour être alerté même hors de l'application."}
                      </span>
                      {notifPerm === 'default' && (
                        <button
                          type="button"
                          onClick={enableDesktopNotifs}
                          className="shrink-0 rounded-[7px] bg-[#0F4C81] px-2.5 py-1 text-[10px] font-medium text-white hover:bg-[#1A6DB5]"
                        >
                          Activer
                        </button>
                      )}
                    </div>
                  )}

                  {/* Liste */}
                  <div className="max-h-[360px] overflow-y-auto">
                    {notifItems.length === 0 && (
                      <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#ECFDF5] text-[#047857]">
                          <BellOff className="h-5 w-5" />
                        </div>
                        <div className="text-xs font-medium text-[#0F172A]">Tout est à jour</div>
                        <div className="text-[11px] text-[#64748B]">
                          Aucune notification
                        </div>
                      </div>
                    )}
                    {notifItems.map((n) => {
                      const isUnread = !readSet.has(n.key);
                      const Icon = n.kind === 'recharge' ? Coins : n.kind === 'transfert' ? ArrowRightLeft : Clock;
                      const toneCls =
                        n.tone === 'green'
                          ? 'bg-[#ECFDF5] text-[#047857]'
                          : n.tone === 'blue'
                            ? 'bg-[#EFF6FF] text-[#1A6DB5]'
                            : 'bg-[#FFFBEB] text-[#92400E]';
                      const linkProps =
                        n.kind === 'recharge'
                          ? ({ to: '/demandes-recharge' } as const)
                          : n.kind === 'transfert'
                            ? ({ to: '/transferts' } as const)
                            : ({ to: '/bons/$bonId', params: { bonId: n.id } } as const);
                      return (
                        <div
                          key={n.key}
                          className={cn(
                            'group relative flex items-start gap-3 border-b border-[rgba(15,76,129,0.05)] px-4 py-3 transition-colors last:border-0 hover:bg-[#F8FAFC]',
                            isUnread && 'bg-[#F0F7FF]/40',
                          )}
                        >
                          {isUnread && (
                            <span
                              aria-label="Non lu"
                              className="absolute left-1.5 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-[#1A6DB5]"
                            />
                          )}
                          <Link
                            {...(linkProps as any)}
                            onClick={() => {
                              if (isUnread) markRead(n.key);
                              setNotifOpen(false);
                            }}
                            className="flex flex-1 items-start gap-3"
                          >
                            <div
                              className={cn(
                                'flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]',
                                toneCls,
                              )}
                            >
                              <Icon className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-baseline justify-between gap-2">
                                <span
                                  className={cn(
                                    'truncate text-xs',
                                    isUnread ? 'font-semibold text-[#0F172A]' : 'font-medium text-[#475569]',
                                  )}
                                >
                                  {n.title}
                                </span>
                                <span className="shrink-0 text-[10px] tabular-nums text-[#64748B]">
                                  {timeAgo(n.createdAt)}
                                </span>
                              </div>
                              <div className="mt-0.5 flex items-center gap-2">
                                <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', toneCls)}>
                                  {n.badge}
                                </span>
                                <span className="text-[11px] tabular-nums text-[#475569]">
                                  {formatMontant(n.montant)}
                                </span>
                              </div>
                            </div>
                          </Link>
                          {isUnread && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                markRead(n.key);
                              }}
                              title="Marquer comme lu"
                              className="ml-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] text-[#94A3B8] opacity-0 transition hover:bg-[#E8F2FF] hover:text-[#1A6DB5] group-hover:opacity-100"
                            >
                              <CheckCheck className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            {isAdmin && (
              <button
                type="button"
                title="Administration des utilisateurs et rôles"
                onClick={() => navigate({ to: '/users' })}
                className="hidden h-[34px] w-[34px] items-center justify-center rounded-[10px] border border-[rgba(15,76,129,0.1)] bg-white text-[#475569] transition-colors hover:bg-[#E8F2FF] hover:text-[#1A6DB5] sm:flex"
              >
                <Settings className="h-[17px] w-[17px]" />
              </button>
            )}
            {(pathname === '/' || pathname.startsWith('/bons')) && pathname !== '/bons/nouveau' && (
              <Link to="/bons/nouveau">
                <span className="flex items-center gap-1.5 rounded-[9px] bg-[#0F4C81] px-3.5 py-2 text-xs font-medium text-white transition hover:bg-[#1A6DB5]">
                  <Plus className="h-4 w-4" /> Nouveau bon
                </span>
              </Link>
            )}
          </div>
        </header>

        {/* Navigation mobile */}
        <nav className="flex gap-1 overflow-x-auto border-b border-[rgba(15,76,129,0.1)] bg-white px-3 py-2 md:hidden">
          {flatNav.map((item) => (
            <Link key={item.to} to={item.to} activeOptions={{ exact: item.exact }}>
              {({ isActive }) => (
                <span
                  className={cn(
                    'flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs transition-colors',
                    isActive ? 'bg-[#0A1628] text-white' : 'bg-[#F1F5F9] text-[#475569]',
                  )}
                >
                  <item.icon className="h-3.5 w-3.5" />
                  {item.label}
                </span>
              )}
            </Link>
          ))}
        </nav>

        <main className="flex-1 overflow-y-auto p-5 sm:p-7">
          <div className="mx-auto max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
