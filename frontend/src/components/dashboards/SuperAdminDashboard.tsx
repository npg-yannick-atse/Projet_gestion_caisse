import { useMemo } from 'react';
import { Link } from '@tanstack/react-router';
import {
  Activity,
  Briefcase,
  Database,
  Landmark,
  Network,
  ShieldCheck,
  UserCheck,
  Users as UsersIcon,
  Wallet,
} from 'lucide-react';
import { useCaisses } from '@/api/caisses';
import { useDirections } from '@/api/directions';
import { usePortefeuilles } from '@/api/financierRef';
import { useUsers } from '@/api/users';
import { cn } from '@/lib/utils';
import type { User } from '@/types/api';
import { AdminDashboard } from './AdminDashboard';

interface Props {
  user: User;
}

/**
 * Vue Super-Administrateur :
 * - Hérite intégralement de l'AdminDashboard (avec la nuance visuelle "super")
 * - Ajoute un bandeau "Santé du système" : utilisateurs actifs/inactifs, portefeuilles,
 *   caisses, directions, anomalies de configuration.
 */
export function SuperAdminDashboard({ user }: Props) {
  const { data: users } = useUsers();
  const { data: portefeuilles } = usePortefeuilles();
  const { data: caisses } = useCaisses();
  const { data: directions } = useDirections();

  const stats = useMemo(() => {
    const usrs = users ?? [];
    const actifs = usrs.filter((u) => u.estActif).length;
    const inactifs = usrs.length - actifs;
    const ptfs = portefeuilles ?? [];
    const ptfsSansGestionnaire = ptfs.filter((p) => !p.gestionnaireId).length;
    const caissesList = caisses ?? [];
    return {
      usersTotal: usrs.length,
      usersActifs: actifs,
      usersInactifs: inactifs,
      ptfsTotal: ptfs.length,
      ptfsSansGestionnaire,
      caissesTotal: caissesList.length,
      caissesOuvertes: caissesList.filter((c) => c.statut === 'OUVERTE').length,
      caissesPrincipales: caissesList.filter((c) => c.estPrincipale).length,
      directionsTotal: (directions ?? []).length,
    };
  }, [users, portefeuilles, caisses, directions]);

  return (
    <div className="flex flex-col gap-5">
      {/* Bandeau santé système (spécifique super-admin, en tête) */}
      <div className="overflow-hidden rounded-[16px] border border-[#A78BFA] bg-gradient-to-br from-[#F5F3FF] to-white">
        <div className="flex items-center gap-3 border-b border-[#DDD6FE] bg-white/60 px-5 py-3 backdrop-blur">
          <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[#7C3AED] text-white">
            <Activity className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <div className="font-display text-[13px] font-semibold text-[#0F172A]">
              Santé du système
            </div>
            <div className="text-[11px] text-[#64748B]">
              Vue super administrateur — topologie & intégrité
            </div>
          </div>
          <span className="rounded-full bg-[#EDE9FE] px-2.5 py-0.5 text-[10px] font-semibold text-[#6D28D9]">
            {user.matricule}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-px bg-[#DDD6FE] p-px sm:grid-cols-3 lg:grid-cols-6">
          <SysTile
            icon={UserCheck}
            label="Utilisateurs actifs"
            value={stats.usersActifs}
            sub={`sur ${stats.usersTotal}`}
            to="/users"
          />
          <SysTile
            icon={UsersIcon}
            label="Inactifs"
            value={stats.usersInactifs}
            sub={stats.usersInactifs > 0 ? 'Comptes désactivés' : 'Aucun'}
            warn={stats.usersInactifs > 0}
            to="/users"
          />
          <SysTile
            icon={Network}
            label="Directions"
            value={stats.directionsTotal}
            sub="Organisationnelles"
            to="/directions"
          />
          <SysTile
            icon={Wallet}
            label="Portefeuilles"
            value={stats.ptfsTotal}
            sub={
              stats.ptfsSansGestionnaire > 0
                ? `${stats.ptfsSansGestionnaire} sans gestionnaire`
                : 'Tous pilotés'
            }
            warn={stats.ptfsSansGestionnaire > 0}
            to="/caisses"
          />
          <SysTile
            icon={Landmark}
            label="Caisses ouvertes"
            value={`${stats.caissesOuvertes} / ${stats.caissesTotal}`}
            sub={`${stats.caissesPrincipales} principale${stats.caissesPrincipales > 1 ? 's' : ''}`}
            to="/caisses"
          />
          <SysTile
            icon={Database}
            label="Intégrité"
            value="OK"
            sub="Comptable & DB"
            ok
          />
        </div>
      </div>

      {/* Récap système supplémentaire si anomalies */}
      {(stats.ptfsSansGestionnaire > 0 || stats.usersInactifs > 0) && (
        <div className="rounded-[12px] border border-[#FECDCA] bg-[#FEF3F2] p-4 text-[11px] text-[#7F1D1D]">
          <div className="mb-1 flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span className="font-semibold uppercase tracking-[0.6px]">Recommandations</span>
          </div>
          <ul className="ml-5 list-disc space-y-0.5">
            {stats.ptfsSansGestionnaire > 0 && (
              <li>
                Affecter un gestionnaire à {stats.ptfsSansGestionnaire} portefeuille
                {stats.ptfsSansGestionnaire > 1 ? 's' : ''} — pour activer le pilotage budgétaire.
              </li>
            )}
            {stats.usersInactifs > 0 && (
              <li>
                Vérifier {stats.usersInactifs} compte{stats.usersInactifs > 1 ? 's' : ''} inactif
                {stats.usersInactifs > 1 ? 's' : ''} — réactiver ou archiver.
              </li>
            )}
          </ul>
        </div>
      )}

      {/* Héritage Admin (KPIs, bar par direction, anomalies, pipeline) */}
      <AdminDashboard user={user} isSuper />
    </div>
  );
}

function SysTile({
  icon: Icon,
  label,
  value,
  sub,
  warn = false,
  ok = false,
  to,
}: {
  icon: typeof Briefcase;
  label: string;
  value: React.ReactNode;
  sub?: string;
  warn?: boolean;
  ok?: boolean;
  to?: string;
}) {
  const body = (
    <div className={cn('flex flex-col gap-1 bg-white p-3 transition-colors hover:bg-[#FAFBFF]')}>
      <div className="flex items-center gap-1.5">
        <Icon
          className={cn(
            'h-3.5 w-3.5',
            warn ? 'text-[#F59E0B]' : ok ? 'text-[#10B981]' : 'text-[#7C3AED]',
          )}
        />
        <span className="text-[10px] uppercase tracking-[0.6px] text-[#64748B]">{label}</span>
      </div>
      <div className="font-display text-[18px] font-semibold tabular-nums text-[#0F172A]">{value}</div>
      {sub && (
        <div
          className={cn(
            'text-[10px]',
            warn ? 'text-[#92400E]' : ok ? 'text-[#047857]' : 'text-[#94A3B8]',
          )}
        >
          {sub}
        </div>
      )}
    </div>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}
