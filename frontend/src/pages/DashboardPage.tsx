import { useUserRoles } from '@/api/users';
import { useAuthStore } from '@/stores/auth.store';
import { effectivePersona, usePersonaStore } from '@/stores/persona.store';
import { ValidateurDashboard } from '@/components/dashboards/ValidateurDashboard';
import { CaissierDashboard } from '@/components/dashboards/CaissierDashboard';
import { DemandeurDashboard } from '@/components/dashboards/DemandeurDashboard';
import { GestionnaireDashboard } from '@/components/dashboards/GestionnaireDashboard';
import { AdminDashboard } from '@/components/dashboards/AdminDashboard';
import { SuperAdminDashboard } from '@/components/dashboards/SuperAdminDashboard';
import { DAFDashboard } from '@/components/dashboards/DAFDashboard';
import type { RoleCode } from '@/types/api';

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <div className="h-24 animate-pulse rounded-[16px] bg-gradient-to-br from-[#0A1628] to-[#1A6DB5] opacity-30" />
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-32 animate-pulse rounded-[14px] border border-[rgba(15,76,129,0.1)] bg-white"
          />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-[14px] border border-[rgba(15,76,129,0.1)] bg-white" />
    </div>
  );
}

/**
 * Aiguillage du tableau de bord vers la vue correspondant au persona connecté.
 * Toutes les hooks sont appelées de manière stable (avant tout return conditionnel)
 * pour respecter les règles des hooks.
 */
export function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const { data: userRoles } = useUserRoles(user?.id ?? null);
  const activePersona = usePersonaStore((s) => s.activePersona);

  // Tant qu'on n'a pas l'utilisateur OU ses rôles, on affiche un skeleton.
  // Cela évite de monter un dashboard puis de switcher, et garde le nombre de hooks stable.
  if (!user || userRoles === undefined) {
    return <LoadingSkeleton />;
  }

  const roleCodes = new Set<RoleCode>((userRoles ?? []).map((r) => r.code));
  // effectivePersona respecte le choix explicite de l'utilisateur s'il a toujours
  // le rôle correspondant, sinon retombe sur la priorité par défaut.
  const persona = effectivePersona(roleCodes, activePersona);

  switch (persona) {
    case 'SUPER_ADMIN':
      return <SuperAdminDashboard user={user} />;
    case 'DAF':
      return <DAFDashboard user={user} />;
    case 'ADMIN':
      return <AdminDashboard user={user} />;
    case 'VALIDATEUR':
      return <ValidateurDashboard user={user} />;
    case 'CAISSIER':
      return <CaissierDashboard user={user} />;
    case 'GESTIONNAIRE_PORTEFEUILLE':
      return <GestionnaireDashboard user={user} />;
    case 'DEMANDEUR':
    default:
      return <DemandeurDashboard user={user} />;
  }
}
