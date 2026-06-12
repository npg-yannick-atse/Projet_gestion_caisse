import { useMemo, useState } from 'react';
import { Ban, Plus, Repeat } from 'lucide-react';
import { useInterims, useCreateInterim, useRevokeInterim } from '@/api/interims';
import { useUsers } from '@/api/users';
import { useRoles, usePermissions } from '@/api/roles';
import { useProfils } from '@/api/profils';
import { apiErrorMessage, cn } from '@/lib/utils';
import type { Interim, InterimStatut } from '@/types/api';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { RoleGuard } from '@/components/RoleGuard';

const selectClass =
  'h-10 w-full rounded-[9px] border border-[rgba(15,76,129,0.1)] bg-white px-3 text-sm text-[#0F172A] outline-none transition focus:border-[#1A6DB5]';
const inputClass = selectClass;
const labelClass = 'text-[11px] font-semibold uppercase tracking-[0.6px] text-[#64748B]';

const STATUT_BADGE: Record<InterimStatut, { label: string; cls: string }> = {
  ACTIF: { label: 'Actif', cls: 'bg-[#ECFDF5] text-[#047857]' },
  EXPIRE: { label: 'Expiré', cls: 'bg-[#F1F5F9] text-[#475569]' },
  REVOQUE: { label: 'Révoqué', cls: 'bg-[#FEF3F2] text-[#B42318]' },
};

type DelegType = 'ROLE' | 'PROFIL' | 'PERMISSION';

function CreateInterimForm({ onDone }: { onDone: () => void }) {
  const create = useCreateInterim();
  const { data: users } = useUsers();
  const { data: roles } = useRoles();
  const { data: profils } = useProfils();
  const { data: permissions } = usePermissions();

  const [initiateurId, setInitiateurId] = useState('');
  const [remplacantId, setRemplacantId] = useState('');
  const [delegType, setDelegType] = useState<DelegType>('ROLE');
  const [delegId, setDelegId] = useState('');
  const [dateDebut, setDateDebut] = useState('');
  const [dateFin, setDateFin] = useState('');
  const [commentaire, setCommentaire] = useState('');

  const sameUser = initiateurId && remplacantId && initiateurId === remplacantId;
  const valid =
    initiateurId && remplacantId && !sameUser && delegId && dateDebut && dateFin && dateDebut < dateFin;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    create.mutate(
      {
        initiateurId,
        remplacantId,
        roleTransfereId: delegType === 'ROLE' ? delegId : undefined,
        profilTransfereId: delegType === 'PROFIL' ? delegId : undefined,
        permissionId: delegType === 'PERMISSION' ? delegId : undefined,
        dateDebut: new Date(dateDebut).toISOString(),
        dateFin: new Date(dateFin).toISOString(),
        commentaire: commentaire || undefined,
      },
      { onSuccess: () => onDone() },
    );
  };

  return (
    <Panel>
      <PanelHeader title="Nouvel intérim" />
      <form onSubmit={submit} className="grid gap-4 p-[18px] sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>Initiateur (absent)</label>
          <select
            aria-label="Initiateur"
            className={selectClass}
            value={initiateurId}
            onChange={(e) => setInitiateurId(e.target.value)}
          >
            <option value="">— Choisir —</option>
            {users?.map((u) => (
              <option key={u.id} value={u.id}>
                {u.prenom} {u.nom} (#{u.matricule})
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>Remplaçant</label>
          <select
            aria-label="Remplaçant"
            className={selectClass}
            value={remplacantId}
            onChange={(e) => setRemplacantId(e.target.value)}
          >
            <option value="">— Choisir —</option>
            {users?.map((u) => (
              <option key={u.id} value={u.id}>
                {u.prenom} {u.nom} (#{u.matricule})
              </option>
            ))}
          </select>
          {sameUser && <p className="text-[11px] text-[#B42318]">Doit être différent de l'initiateur.</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>Type de délégation</label>
          <select
            aria-label="Type de délégation"
            className={selectClass}
            value={delegType}
            onChange={(e) => {
              setDelegType(e.target.value as DelegType);
              setDelegId('');
            }}
          >
            <option value="ROLE">Rôle</option>
            <option value="PROFIL">Profil</option>
            <option value="PERMISSION">Permission</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>
            {delegType === 'ROLE' ? 'Rôle délégué' : delegType === 'PROFIL' ? 'Profil délégué' : 'Permission déléguée'}
          </label>
          <select
            aria-label="Élément délégué"
            className={selectClass}
            value={delegId}
            onChange={(e) => setDelegId(e.target.value)}
          >
            <option value="">— Choisir —</option>
            {delegType === 'ROLE' &&
              roles?.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.libelle}
                </option>
              ))}
            {delegType === 'PROFIL' &&
              profils?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.libelle}
                </option>
              ))}
            {delegType === 'PERMISSION' &&
              permissions?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.libelle} ({p.code})
                </option>
              ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>Début</label>
          <input
            type="datetime-local"
            aria-label="Date de début"
            className={inputClass}
            value={dateDebut}
            onChange={(e) => setDateDebut(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>Fin</label>
          <input
            type="datetime-local"
            aria-label="Date de fin"
            className={inputClass}
            value={dateFin}
            onChange={(e) => setDateFin(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label className={labelClass}>Commentaire (optionnel)</label>
          <input
            className={inputClass}
            value={commentaire}
            onChange={(e) => setCommentaire(e.target.value)}
            placeholder="Motif de l'intérim…"
          />
        </div>

        <div className="flex items-center gap-2 sm:col-span-2">
          <button
            type="submit"
            disabled={!valid || create.isPending}
            className="flex items-center gap-1.5 rounded-[9px] bg-[#0F4C81] px-4 py-2 text-xs font-medium text-white transition hover:bg-[#1A6DB5] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Plus className="h-4 w-4" /> {create.isPending ? 'Création…' : "Créer l'intérim"}
          </button>
          <button type="button" onClick={onDone} className="text-xs font-medium text-[#64748B] hover:text-[#0F172A]">
            Annuler
          </button>
          {create.isError && (
            <p className="text-sm text-[#EF4444]">{apiErrorMessage(create.error, 'Création impossible')}</p>
          )}
        </div>
      </form>
    </Panel>
  );
}

function InterimsPageInner() {
  const { data: interims, isLoading } = useInterims();
  const { data: users } = useUsers();
  const { data: roles } = useRoles();
  const { data: profils } = useProfils();
  const { data: permissions } = usePermissions();
  const revoke = useRevokeInterim();
  const [showForm, setShowForm] = useState(false);

  const userById = useMemo(() => new Map((users ?? []).map((u) => [u.id, u])), [users]);
  const roleById = useMemo(() => new Map((roles ?? []).map((r) => [r.id, r])), [roles]);
  const profilById = useMemo(() => new Map((profils ?? []).map((p) => [p.id, p])), [profils]);
  const permById = useMemo(() => new Map((permissions ?? []).map((p) => [p.id, p])), [permissions]);

  const userName = (id: string) => {
    const u = userById.get(id);
    return u ? `${u.prenom} ${u.nom}` : `#${id}`;
  };
  const delegLabel = (i: Interim): string => {
    if (i.roleTransfereId) return `Rôle : ${roleById.get(i.roleTransfereId)?.libelle ?? i.roleTransfereId}`;
    if (i.profilTransfereId) return `Profil : ${profilById.get(i.profilTransfereId)?.libelle ?? i.profilTransfereId}`;
    if (i.permissionId) return `Permission : ${permById.get(i.permissionId)?.libelle ?? `#${i.permissionId}`}`;
    return '—';
  };
  const fmt = (iso: string) =>
    new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });

  return (
    <div className="flex flex-col gap-4">
      {showForm && <CreateInterimForm onDone={() => setShowForm(false)} />}

      <Panel>
        <PanelHeader title="Intérims" badge={`${interims?.length ?? 0}`}>
          {!showForm && (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="ml-auto flex items-center gap-1.5 rounded-[9px] bg-[#0F4C81] px-3.5 py-1.5 text-[11px] font-medium text-white transition hover:bg-[#1A6DB5]"
            >
              <Plus className="h-4 w-4" /> Nouvel intérim
            </button>
          )}
        </PanelHeader>

        {isLoading && <div className="px-[18px] py-8 text-sm text-[#64748B]">Chargement…</div>}

        {interims && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[#F8FAFC]">
                <tr className="text-left text-[10px] uppercase tracking-[0.7px] text-[#64748B]">
                  <th className="px-4 py-2.5 font-semibold">Initiateur</th>
                  <th className="px-4 py-2.5 font-semibold">Remplaçant</th>
                  <th className="px-4 py-2.5 font-semibold">Délégué</th>
                  <th className="px-4 py-2.5 font-semibold">Période</th>
                  <th className="px-4 py-2.5 font-semibold">Statut</th>
                  <th className="px-4 py-2.5">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {interims.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-[#64748B]">
                      <Repeat className="mx-auto mb-2 h-6 w-6 opacity-30" />
                      Aucun intérim. Déclare une délégation avec « Nouvel intérim ».
                    </td>
                  </tr>
                )}
                {interims.map((i) => {
                  const b = STATUT_BADGE[i.statut];
                  return (
                    <tr key={i.id} className="border-t border-[rgba(15,76,129,0.05)] hover:bg-[#FAFBFF]">
                      <td className="px-4 py-3 font-medium text-[#0F172A]">{userName(i.initiateurId)}</td>
                      <td className="px-4 py-3">{userName(i.remplacantId)}</td>
                      <td className="px-4 py-3 text-[#475569]">{delegLabel(i)}</td>
                      <td className="px-4 py-3 text-[#64748B]">
                        {fmt(i.dateDebut)} → {fmt(i.dateFin)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn('inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold', b.cls)}>
                          {b.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {i.statut === 'ACTIF' && (
                          <button
                            type="button"
                            disabled={revoke.isPending}
                            onClick={() => {
                              if (confirm(`Révoquer cet intérim ?`)) revoke.mutate(i.id);
                            }}
                            title="Révoquer"
                            className="inline-flex items-center gap-1 rounded-[7px] border border-[rgba(15,76,129,0.15)] px-2.5 py-1 text-[11px] font-medium text-[#B42318] hover:bg-[#FEF3F2] disabled:opacity-60"
                          >
                            <Ban className="h-3 w-3" /> Révoquer
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

export function InterimsPage() {
  return (
    <RoleGuard allow={['SUPER_ADMIN', 'ADMINISTRATEUR']}>
      <InterimsPageInner />
    </RoleGuard>
  );
}
