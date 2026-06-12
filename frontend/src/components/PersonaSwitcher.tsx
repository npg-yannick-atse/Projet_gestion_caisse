import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BadgeCheck,
  Briefcase,
  Check,
  ChevronDown,
  ShieldCheck,
  User as UserIcon,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { useUserRoles } from '@/api/users';
import {
  availablePersonas,
  effectivePersona,
  usePersonaStore,
  type Persona,
} from '@/stores/persona.store';
import { cn } from '@/lib/utils';
import type { RoleCode } from '@/types/api';

const PERSONA_META: Record<
  Persona,
  { label: string; sub: string; icon: LucideIcon; tone: string }
> = {
  SUPER_ADMIN: {
    label: 'Super administrateur',
    sub: 'Santé système & pilotage global',
    icon: ShieldCheck,
    tone: 'bg-[#F5F3FF] text-[#6D28D9]',
  },
  DAF: {
    label: 'Directeur Admin. & Financier',
    sub: 'Pilotage & supervision des caisses',
    icon: ShieldCheck,
    tone: 'bg-[#EFF6FF] text-[#0F4C81]',
  },
  ADMIN: {
    label: 'Administrateur',
    sub: 'Pilotage organisationnel',
    icon: ShieldCheck,
    tone: 'bg-[#EFF6FF] text-[#0F4C81]',
  },
  VALIDATEUR: {
    label: 'Validateur',
    sub: "File d'attente & arbitrage",
    icon: BadgeCheck,
    tone: 'bg-[#EFF6FF] text-[#1A6DB5]',
  },
  CAISSIER: {
    label: 'Caissier',
    sub: 'Décaissement & supervision caisses',
    icon: Wallet,
    tone: 'bg-[#ECFDF5] text-[#047857]',
  },
  GESTIONNAIRE_PORTEFEUILLE: {
    label: 'Gestionnaire de portefeuille',
    sub: 'Pilotage des enveloppes',
    icon: Briefcase,
    tone: 'bg-[#ECFEFF] text-[#0E7490]',
  },
  DEMANDEUR: {
    label: 'Demandeur',
    sub: 'Mes bons & mon budget',
    icon: UserIcon,
    tone: 'bg-[#F1F5F9] text-[#475569]',
  },
};

/**
 * Petit sélecteur affiché dans la topbar quand l'utilisateur a ≥ 2 rôles.
 * Permet de basculer entre les dashboards correspondants sans se déconnecter.
 */
export function PersonaSwitcher() {
  const user = useAuthStore((s) => s.user);
  const { data: userRoles } = useUserRoles(user?.id ?? null);
  const { activePersona, setActivePersona } = usePersonaStore();

  const roleCodes = useMemo(
    () => new Set<RoleCode>((userRoles ?? []).map((r) => r.code)),
    [userRoles],
  );
  const available = useMemo(() => availablePersonas(roleCodes), [roleCodes]);
  const current = useMemo(
    () => effectivePersona(roleCodes, activePersona),
    [roleCodes, activePersona],
  );
  const meta = PERSONA_META[current];

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Si un seul rôle disponible : pas la peine d'afficher le sélecteur.
  if (available.length < 2) return null;

  const Icon = meta.icon;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
        title="Changer de rôle actif"
        className={cn(
          'flex items-center gap-2 rounded-[10px] border border-[rgba(15,76,129,0.1)] bg-white px-2.5 py-1.5 text-xs transition-colors hover:bg-[#F8FAFC]',
          open && 'bg-[#F8FAFC]',
        )}
      >
        <span
          className={cn(
            'flex h-6 w-6 items-center justify-center rounded-[7px]',
            meta.tone,
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="hidden font-medium text-[#0F172A] sm:inline">{meta.label}</span>
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 text-[#64748B] transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-[300px] overflow-hidden rounded-[14px] border border-[rgba(15,76,129,0.12)] bg-white shadow-[0_12px_32px_rgba(15,23,42,0.18)]"
        >
          <div className="flex items-center gap-2.5 border-b border-[rgba(15,76,129,0.08)] bg-[#F8FAFC] px-4 py-3">
            <Users className="h-4 w-4 text-[#1A6DB5]" />
            <div className="flex-1">
              <div className="font-display text-[13px] font-semibold text-[#0F172A]">
                Vos rôles ({available.length})
              </div>
              <div className="text-[11px] text-[#64748B]">
                Choisissez le tableau de bord à afficher
              </div>
            </div>
          </div>

          <div className="max-h-[360px] overflow-y-auto py-1">
            {available.map((p) => {
              const m = PERSONA_META[p];
              const PIcon = m.icon;
              const isCurrent = p === current;
              return (
                <button
                  key={p}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setActivePersona(p);
                    setOpen(false);
                  }}
                  className={cn(
                    'flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[#F8FAFC]',
                    isCurrent && 'bg-[#EFF6FF]',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]',
                      m.tone,
                    )}
                  >
                    <PIcon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-[#0F172A]">{m.label}</div>
                    <div className="text-[11px] text-[#64748B]">{m.sub}</div>
                  </div>
                  {isCurrent && (
                    <Check className="mt-2 h-4 w-4 shrink-0 text-[#0F4C81]" />
                  )}
                </button>
              );
            })}
          </div>

          <div className="border-t border-[rgba(15,76,129,0.08)] bg-[#F8FAFC] px-4 py-2 text-[10px] text-[#64748B]">
            Votre choix est mémorisé pour ce navigateur.
          </div>
        </div>
      )}
    </div>
  );
}
