import { useMemo, useState } from 'react';
import { History, Search } from 'lucide-react';
import { useAudit } from '@/api/audit';
import { useUsers } from '@/api/users';
import { cn } from '@/lib/utils';
import type { AuditEntry } from '@/types/api';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { RoleGuard } from '@/components/RoleGuard';

const inputClass =
  'h-9 w-full rounded-[9px] border border-[rgba(15,76,129,0.15)] bg-white px-3 text-xs text-[#0F172A] outline-none focus:border-[#1A6DB5]';

const ACTION_CLS: Record<string, string> = {
  CREER: 'bg-[#ECFDF5] text-[#047857]',
  MODIFIER: 'bg-[#EFF6FF] text-[#1A6DB5]',
  SUPPRIMER: 'bg-[#FEF3F2] text-[#B42318]',
};

function actionClass(a: string): string {
  return ACTION_CLS[a] ?? 'bg-[#F1F5F9] text-[#475569]';
}

/** Date du jour au format YYYY-MM-DD (heure locale). */
function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function AuditPageInner() {
  const today = todayLocal();
  const [entite, setEntite] = useState('');
  const [action, setAction] = useState('');
  // Par défaut, on n'affiche que le journal du JOUR (même logique que la page Opérations).
  const [dateFrom, setDateFrom] = useState(() => todayLocal());
  const [dateTo, setDateTo] = useState(() => todayLocal());

  // Vue par défaut = aujourd'hui, sans autre filtre.
  const isDefaultView = !entite && !action && dateFrom === today && dateTo === today;
  const resetToToday = () => {
    setEntite('');
    setAction('');
    setDateFrom(today);
    setDateTo(today);
  };

  const { data: entries, isLoading } = useAudit({
    entite: entite || undefined,
    action: action || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });
  const { data: users } = useUsers();
  const userById = useMemo(() => new Map((users ?? []).map((u) => [u.id, u])), [users]);

  const userName = (id?: string | null) => {
    if (!id) return 'Système';
    const u = userById.get(id);
    return u ? `${u.prenom} ${u.nom}` : `#${id}`;
  };
  const fmt = (iso: string) =>
    new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });

  return (
    <div className="flex flex-col gap-4">
      <Panel>
        <PanelHeader title="Journal d'audit" badge={`${entries?.length ?? 0}`} />

        {/* Filtres */}
        <div className="grid gap-2 border-b border-[rgba(15,76,129,0.08)] bg-[#F8FAFC] px-[18px] py-3 sm:grid-cols-4">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#94A3B8]" />
            <input
              className={cn(inputClass, 'pl-8')}
              value={entite}
              onChange={(e) => setEntite(e.target.value)}
              placeholder="Entité (caisses, bons, users…)"
            />
          </div>
          <input
            className={inputClass}
            value={action}
            onChange={(e) => setAction(e.target.value)}
            placeholder="Action (CREER, validate…)"
          />
          <input type="date" aria-label="Du" title="Du" className={inputClass} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <input type="date" aria-label="Au" title="Au" className={inputClass} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>

        {!isDefaultView && (
          <div className="flex items-center justify-between gap-2 border-b border-[rgba(15,76,129,0.08)] bg-[#F8FAFC] px-[18px] py-2">
            <span className="text-[11px] text-[#64748B]">Filtre personnalisé actif — la vue par défaut affiche le journal du jour.</span>
            <button
              type="button"
              onClick={resetToToday}
              title="Revenir au journal du jour"
              className="shrink-0 rounded-[9px] border border-[rgba(15,76,129,0.15)] bg-white px-3 py-1.5 text-xs font-medium text-[#475569] hover:bg-[#F1F5F9]"
            >
              Aujourd'hui
            </button>
          </div>
        )}

        {isLoading && <div className="px-[18px] py-8 text-sm text-[#64748B]">Chargement…</div>}

        {entries && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[#F8FAFC]">
                <tr className="text-left text-[10px] uppercase tracking-[0.7px] text-[#64748B]">
                  <th className="px-4 py-2.5 font-semibold">Date &amp; heure</th>
                  <th className="px-4 py-2.5 font-semibold">Utilisateur</th>
                  <th className="px-4 py-2.5 font-semibold">Action</th>
                  <th className="px-4 py-2.5 font-semibold">Entité</th>
                  <th className="px-4 py-2.5 font-semibold">Détail</th>
                  <th className="px-4 py-2.5 font-semibold">IP</th>
                </tr>
              </thead>
              <tbody>
                {entries.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-[#64748B]">
                      <History className="mx-auto mb-2 h-6 w-6 opacity-30" />
                      Aucune entrée d'audit pour ces filtres.
                    </td>
                  </tr>
                )}
                {entries.map((e: AuditEntry) => (
                  <tr key={e.id} className="border-t border-[rgba(15,76,129,0.05)] align-top hover:bg-[#FAFBFF]">
                    <td className="whitespace-nowrap px-4 py-2.5 text-[#64748B]">{fmt(e.dateAction)}</td>
                    <td className="px-4 py-2.5 font-medium text-[#0F172A]">{userName(e.userId)}</td>
                    <td className="px-4 py-2.5">
                      <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold', actionClass(e.action))}>
                        {e.action}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-[#475569]">
                      {e.entiteConcernee}
                      {e.entiteId ? <span className="text-[#94A3B8]"> #{e.entiteId}</span> : null}
                    </td>
                    <td className="max-w-[360px] truncate px-4 py-2.5 font-mono text-[10px] text-[#64748B]" title={e.nouvelleValeur ?? ''}>
                      {e.nouvelleValeur || '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-[10px] text-[#94A3B8]">{e.adresseIp || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="px-[18px] py-3 text-[11px] text-[#94A3B8]">
          Journal en lecture seule (append-only) — limité aux 500 entrées les plus récentes par filtre.
        </p>
      </Panel>
    </div>
  );
}

export function AuditPage() {
  return (
    <RoleGuard allow={['SUPER_ADMIN']}>
      <AuditPageInner />
    </RoleGuard>
  );
}
