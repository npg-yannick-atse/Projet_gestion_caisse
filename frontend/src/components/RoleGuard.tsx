import { Link } from '@tanstack/react-router';
import { Lock } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { useUserRoles } from '@/api/users';
import type { RoleCode } from '@/types/api';

interface Props {
  allow: RoleCode[];
  children: React.ReactNode;
  fallbackHref?: string;
}

/**
 * Protège une route en vérifiant que l'utilisateur connecté possède au moins
 * un des rôles autorisés. Sinon affiche une page d'accès refusé.
 *
 * Note : c'est un garde-fou de DEFENSE EN PROFONDEUR — le backend doit aussi
 * valider les permissions sur chaque endpoint. Ne pas s'y fier seul.
 */
export function RoleGuard({ allow, children, fallbackHref = '/' }: Props) {
  const user = useAuthStore((s) => s.user);
  const { data: roles, isLoading } = useUserRoles(user?.id ?? null);

  if (!user || isLoading || roles === undefined) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-[#64748B]">
        Vérification des permissions…
      </div>
    );
  }

  const userCodes = new Set<RoleCode>(roles.map((r) => r.code));
  const ok = allow.some((r) => userCodes.has(r));

  if (ok) return <>{children}</>;

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-[16px] border border-[rgba(15,76,129,0.1)] bg-white p-10 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#FEF3F2] text-[#B42318]">
        <Lock className="h-6 w-6" />
      </div>
      <div className="font-display text-lg font-semibold">Accès refusé</div>
      <p className="text-sm text-[#64748B]">
        Vous n'avez pas les permissions nécessaires pour accéder à cette page.
        Cette section est réservée aux profils :{' '}
        <strong className="text-[#0F172A]">{allow.join(', ')}</strong>.
      </p>
      <Link
        to={fallbackHref}
        className="mt-2 rounded-[9px] bg-[#0F4C81] px-4 py-2 text-xs font-medium text-white hover:bg-[#1A6DB5]"
      >
        Retour au tableau de bord
      </Link>
    </div>
  );
}
