import { useMemo, useState } from 'react';
import { Ban, Plus, Repeat } from 'lucide-react';
import { useInterims, useMesInterims, useCreateInterim, useRevokeInterim } from '@/api/interims';
import { useUsers, useMyPermissions } from '@/api/users';
import { useAuthStore } from '@/stores/auth.store';
import { useRoles, usePermissions } from '@/api/roles';
import { useProfils } from '@/api/profils';
import { apiErrorMessage, cn } from '@/lib/utils';
import type { Interim, InterimStatut } from '@/types/api';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { RoleGuard } from '@/components/RoleGuard';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { SortableHeader } from '@/components/SortableHeader';
import { useTableSort } from '@/hooks/useTableSort';
import { useClientSort } from '@/hooks/useClientSort';

const selectClass =
  'h-10 w-full rounded-[9px] border border-[rgba(15,76,129,0.1)] bg-white px-3 text-sm text-[#0F172A] outline-none transition focus:border-[#1A6DB5]';
const inputClass = selectClass;
const labelClass = 'text-[11px] font-semibold uppercase tracking-[0.6px] text-[#64748B]';

const INTERIM_SORT_COLUMNS = ['initiateur', 'remplacant', 'delegue', 'debut', 'statut'] as const;
type InterimSortCol = (typeof INTERIM_SORT_COLUMNS)[number];

const STATUT_BADGE: Record<InterimStatut, { label: string; cls: string }> = {
  ACTIF: { label: 'Actif', cls: 'bg-[#ECFDF5] text-[#047857]' },
  EXPIRE: { label: 'Expiré', cls: 'bg-[#F1F5F9] text-[#475569]' },
  REVOQUE: { label: 'Révoqué', cls: 'bg-[#FEF3F2] text-[#B42318]' },
};

type DelegType = 'ROLE' | 'PROFIL' | 'PERMISSION';

function CreateInterimForm({
  onDone,
  peutDeclarerPourAutrui,
}: {
  onDone: () => void;
  /** INTERIM_DECLARER_TIERS : autorise le choix d'un autre initiateur que soi. */
  peutDeclarerPourAutrui: boolean;
}) {
  const create = useCreateInterim();
  const { data: users } = useUsers();
  const { data: roles } = useRoles();
  const { data: profils } = useProfils();
  const { data: permissions } = usePermissions();
  const currentUser = useAuthStore((s) => s.user);
  const moi = (users ?? []).find((u) => String(u.id) === String(currentUser?.id));

  // Sans le droit de déclarer pour autrui, l'initiateur est forcément soi-même.
  const [initiateurId, setInitiateurId] = useState('');
  const [remplacantId, setRemplacantId] = useState('');
  const [delegType, setDelegType] = useState<DelegType>('ROLE');
  const [delegId, setDelegId] = useState('');
  /**
   * Copier TOUT ce que l'absent détient plutôt que de désigner un droit.
   * Le serveur crée alors un intérim par rôle et par profil : ce qui est
   * délégué reste lisible ligne à ligne, et se révoque séparément.
   */
  const [copieTout, setCopieTout] = useState(false);
  const [dateDebut, setDateDebut] = useState('');
  const [dateFin, setDateFin] = useState('');
  const [commentaire, setCommentaire] = useState('');

  // Initiateur effectif : celui choisi si on en a le droit, sinon soi-même.
  const initiateurEffectif = peutDeclarerPourAutrui ? initiateurId : String(currentUser?.id ?? '');
  const sameUser =
    initiateurEffectif && remplacantId && String(initiateurEffectif) === String(remplacantId);
  // Le backend refuse qu'on se désigne remplaçant d'un intérim déclaré pour autrui
  // (anti-escalade) : on le signale ici plutôt que d'attendre le 403.
  const autoRemplacement =
    peutDeclarerPourAutrui &&
    !!initiateurId &&
    String(initiateurId) !== String(currentUser?.id) &&
    String(remplacantId) === String(currentUser?.id);
  const valid =
    initiateurEffectif &&
    remplacantId &&
    !sameUser &&
    !autoRemplacement &&
    (copieTout || delegId) &&
    dateDebut &&
    dateFin &&
    dateDebut < dateFin;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    create.mutate(
      {
        initiateurId: initiateurEffectif,
        remplacantId,
        copierTousLesDroits: copieTout || undefined,
        roleTransfereId: !copieTout && delegType === 'ROLE' ? delegId : undefined,
        profilTransfereId: !copieTout && delegType === 'PROFIL' ? delegId : undefined,
        permissionId: !copieTout && delegType === 'PERMISSION' ? delegId : undefined,
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
          {peutDeclarerPourAutrui ? (
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
          ) : (
            // Sans INTERIM_DECLARER_TIERS, on ne déclare que POUR SOI : le champ est
            // figé plutôt que présenté comme un choix, car le backend imposerait de
            // toute façon l'utilisateur connecté.
            <>
              <div className={cn(selectClass, 'flex items-center bg-[#F8FAFC] text-[#475569]')}>
                {moi ? `${moi.prenom} ${moi.nom} (#${moi.matricule})` : 'Moi'}
              </div>
              <p className="text-[11px] text-[#94A3B8]">
                Vous ne pouvez déclarer un intérim que pour vous-même.
              </p>
            </>
          )}
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
          {autoRemplacement && (
            <p className="text-[11px] text-[#B42318]">
              Vous ne pouvez pas vous désigner remplaçant d'un intérim déclaré pour quelqu'un d'autre.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label className="flex cursor-pointer items-start gap-2 rounded-[9px] border border-[rgba(15,76,129,0.12)] bg-[#F8FAFC] px-3 py-2.5">
            <input
              type="checkbox"
              checked={copieTout}
              onChange={(e) => setCopieTout(e.target.checked)}
              className="mt-0.5 h-4 w-4"
            />
            <span className="text-[12px] text-[#0F172A]">
              <strong>Reprendre tous les droits de l'absent</strong>
              <span className="block text-[11px] text-[#64748B]">
                Un intérim est créé par rôle et par profil détenu. Ce qui est copié est figé
                maintenant : un droit que l'absent obtiendrait pendant son absence ne sera pas transmis.
              </span>
            </span>
          </label>
        </div>

        <div className={cn('flex flex-col gap-1.5', copieTout && 'opacity-40')}>
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
  const currentUser = useAuthStore((s) => s.user);
  const { data: myPerms } = useMyPermissions(currentUser?.id ?? null);
  const permsReady = myPerms !== undefined;
  // INTERIM_VOIR = vision transverse. Sans elle, on n'affiche que SES intérims
  // (délégations émises + celles où l'on remplace quelqu'un).
  const peutToutVoir = (myPerms ?? []).includes('INTERIM_VOIR');
  const peutDeclarer = (myPerms ?? []).includes('INTERIM_DECLARER');
  const peutDeclarerPourAutrui = (myPerms ?? []).includes('INTERIM_DECLARER_TIERS');

  const global = useInterims(undefined, permsReady && peutToutVoir);
  const perso = useMesInterims(permsReady && !peutToutVoir);
  const interimsBruts = peutToutVoir ? global.data : perso.data;
  const isLoading = !permsReady || (peutToutVoir ? global.isLoading : perso.isLoading);

  const { data: users } = useUsers();
  const { data: roles } = useRoles();
  const { data: profils } = useProfils();
  const { data: permissions } = usePermissions();
  const revoke = useRevokeInterim();
  const [showForm, setShowForm] = useState(false);
  const [pendingRevoke, setPendingRevoke] = useState<Interim | null>(null);

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

  // Tri à l'écran : la liste des intérims est courte et chargée en entier.
  // Déclaré APRÈS `userName` / `delegLabel` : les accesseurs les appellent, et
  // ces constantes ne sont pas encore initialisées plus haut dans le rendu.
  const sort = useTableSort<InterimSortCol>('/interims', INTERIM_SORT_COLUMNS);
  const interims = useClientSort(interimsBruts, sort.state, {
    initiateur: (i) => userName(i.initiateurId),
    remplacant: (i) => userName(i.remplacantId),
    delegue: (i) => delegLabel(i),
    debut: (i) => new Date(i.dateDebut),
    statut: (i) => i.statut,
  });

  return (
    <div className="flex flex-col gap-4">
      {showForm && peutDeclarer && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center" onClick={() => setShowForm(false)}>
          <div className="w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <CreateInterimForm
              onDone={() => setShowForm(false)}
              peutDeclarerPourAutrui={peutDeclarerPourAutrui}
            />
          </div>
        </div>
      )}

      <Panel>
        <PanelHeader
          title={peutToutVoir ? 'Intérims' : 'Mes intérims'}
          badge={`${interims?.length ?? 0}`}
        >
          {!showForm && peutDeclarer && (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="ml-auto flex items-center gap-1.5 rounded-[9px] bg-[#0F4C81] px-3.5 py-1.5 text-[11px] font-medium text-white transition hover:bg-[#1A6DB5]"
            >
              <Plus className="h-4 w-4" /> Nouvel intérim
            </button>
          )}
          {!peutDeclarer && (
            <span className="ml-auto text-[11px] text-[#94A3B8]">
              Consultation seule — permission « Déclarer un intérim » requise
            </span>
          )}
        </PanelHeader>

        {isLoading && <div className="px-[18px] py-8 text-sm text-[#64748B]">Chargement…</div>}

        {interims && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[#F8FAFC]">
                <tr className="text-left text-[10px] uppercase tracking-[0.7px] text-[#64748B]">
                  <SortableHeader column="initiateur" state={sort.state} onSort={sort.setSort}>Initiateur</SortableHeader>
                  <SortableHeader column="remplacant" state={sort.state} onSort={sort.setSort}>Remplaçant</SortableHeader>
                  <SortableHeader column="delegue" state={sort.state} onSort={sort.setSort}>Délégué</SortableHeader>
                  <SortableHeader column="debut" state={sort.state} onSort={sort.setSort}>Période</SortableHeader>
                  <SortableHeader column="statut" state={sort.state} onSort={sort.setSort}>Statut</SortableHeader>
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
                      {peutDeclarer
                        ? 'Aucun intérim. Déclare une délégation avec « Nouvel intérim ».'
                        : 'Aucun intérim.'}
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
                            onClick={() => setPendingRevoke(i)}
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

      <ConfirmDialog
        open={!!pendingRevoke}
        variant="warning"
        title="Révoquer cet intérim ?"
        description="L'intérim sera révoqué : le remplaçant perdra les droits associés."
        confirmLabel="Révoquer"
        busy={revoke.isPending}
        error={revoke.isError ? apiErrorMessage(revoke.error, 'Révocation impossible') : undefined}
        onCancel={() => { setPendingRevoke(null); revoke.reset(); }}
        onConfirm={() => { if (pendingRevoke) revoke.mutate(pendingRevoke.id, { onSuccess: () => setPendingRevoke(null) }); }}
      />
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
