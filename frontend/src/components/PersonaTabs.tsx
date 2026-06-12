import { useMemo } from 'react';
import {
  BadgeCheck,
  Briefcase,
  ShieldCheck,
  User as UserIcon,
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

/** Libellés courts adaptés à un affichage inline dans la topbar. */
const PERSONA_TAB: Record<
  Persona,
  { short: string; icon: LucideIcon }
> = {
  SUPER_ADMIN: { short: 'Super admin', icon: ShieldCheck },
  DAF: { short: 'DAF', icon: ShieldCheck },
  ADMIN: { short: 'Administrateur', icon: ShieldCheck },
  VALIDATEUR: { short: 'Validateur', icon: BadgeCheck },
  CAISSIER: { short: 'Caissier', icon: Wallet },
  GESTIONNAIRE_PORTEFEUILLE: { short: 'Gestionnaire', icon: Briefcase },
  DEMANDEUR: { short: 'Demandeur', icon: UserIcon },
};

/**
 * Pilules segmentées dans la topbar : permet de basculer rapidement entre
 * les dashboards correspondant aux différents rôles de l'utilisateur.
 * Ne s'affiche qu'à partir de 2 rôles disponibles.
 */
export function PersonaTabs() {
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

  if (available.length < 2) return null;

  return (
    <div className="hidden overflow-x-auto md:flex" role="tablist" aria-label="Basculer entre vos rôles">
      <div className="inline-flex items-center gap-1 rounded-[10px] border border-[rgba(15,76,129,0.1)] bg-[#F8FAFC] p-1">
        {available.map((p) => {
          const meta = PERSONA_TAB[p];
          const Icon = meta.icon;
          const isActive = p === current;
          // Spread l'attribut pour contourner l'analyseur statique d'axe qui ne sait
          // pas évaluer une expression JSX et signale `aria-selected="{expression}"`.
          const ariaProps = isActive
            ? ({ 'aria-selected': 'true' as const })
            : ({ 'aria-selected': 'false' as const });
          return (
            <button
              key={p}
              type="button"
              role="tab"
              {...ariaProps}
              onClick={() => setActivePersona(p)}
              title={`Basculer sur le tableau de bord ${meta.short}`}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-[7px] px-2.5 py-1 text-[11px] font-medium transition-colors',
                isActive
                  ? 'bg-[#0F4C81] text-white shadow-sm'
                  : 'text-[#475569] hover:bg-white hover:text-[#0F172A]',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="whitespace-nowrap">{meta.short}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
