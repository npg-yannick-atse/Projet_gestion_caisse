import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Ban, Banknote, CalendarRange, CheckCircle2, Clock, Pencil, Plus, Send, X, XCircle } from 'lucide-react';
import {
  useCredits,
  useCreateCredit,
  useUpdateCredit,
  useSolderCredit,
  useApprouverCredit,
  useRejeterCredit,
  useAnnulerCredit,
  useTraiterCredit,
} from '@/api/credits';
import { useEmployesSelectionnables } from '@/api/employes';
import { useCaisses } from '@/api/caisses';
import { usePortefeuilles, useDevises } from '@/api/financierRef';
import { useUserRoles, useMyPermissions } from '@/api/users';
import { useAuthStore } from '@/stores/auth.store';
import { apiErrorMessage, formatMontant } from '@/lib/utils';
import type { Credit, CreditSource, CreditStatut } from '@/types/api';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { SortableHeader } from '@/components/SortableHeader';
import { useTableSort } from '@/hooks/useTableSort';

const CREDIT_SORT_COLUMNS = ['dateDebut', 'montant', 'statut'] as const;
type CreditSortCol = (typeof CREDIT_SORT_COLUMNS)[number];

const STATUT_META: Record<CreditStatut, { label: string; cls: string }> = {
  EN_ATTENTE: { label: 'En attente', cls: 'bg-[#FEF9C3] text-[#92400E]' },
  APPROUVEE: { label: 'Approuvée', cls: 'bg-[#DBEAFE] text-[#1E40AF]' },
  EN_COURS: { label: 'En cours', cls: 'bg-[#E0E7FF] text-[#3730A3]' },
  SOLDE: { label: 'Soldé', cls: 'bg-[#F1F5F9] text-[#64748B]' },
  REJETEE: { label: 'Rejetée', cls: 'bg-[#FEE2E2] text-[#B91C1C]' },
  ANNULEE: { label: 'Annulée', cls: 'bg-[#F1F5F9] text-[#94A3B8]' },
};

/** Permissions du workflow crédit pour l'utilisateur courant. */
function useCreditPerms() {
  const user = useAuthStore((s) => s.user);
  const { data: roles } = useUserRoles(user?.id ?? null);
  const { data: perms } = useMyPermissions(user?.id ?? null);
  const codes = new Set((roles ?? []).map((r) => r.code));
  const isAdmin = codes.has('SUPER_ADMIN') || codes.has('ADMINISTRATEUR') || codes.has('DAF');
  const p = new Set(perms ?? []);
  return {
    userId: user?.id ?? null,
    isAdmin,
    canDemander: isAdmin || p.has('CREDIT_DEMANDER'),
    canValider: isAdmin || p.has('CREDIT_VALIDER'),
    canDecaisser: isAdmin || p.has('CREDIT_DECAISSER'),
  };
}

/** Date du jour au format YYYY-MM-DD (heure locale). */
function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const selectClass =
  'h-10 w-full rounded-[9px] border border-[rgba(15,76,129,0.1)] bg-white px-3 text-sm text-[#0F172A] outline-none focus:border-[#1A6DB5]';
const labelClass = 'text-[11px] font-semibold uppercase tracking-[0.6px] text-[#64748B]';

function mensualite(montant: string, nbMois: number): number {
  const m = Number(montant || 0);
  return nbMois > 0 ? m / nbMois : 0;
}

function dateFin(dateDebut: string, nbMois: number): string {
  const d = new Date(dateDebut);
  if (Number.isNaN(d.getTime())) return '—';
  d.setMonth(d.getMonth() + nbMois);
  return d.toLocaleDateString('fr-FR');
}

export function CreditsPage() {
  const currentUser = useAuthStore((s) => s.user);
  // Historique : par défaut la journée du JOUR, filtre date + tri côté serveur.
  const today = todayLocal();
  const [dateFrom, setDateFrom] = useState(() => todayLocal());
  const [dateTo, setDateTo] = useState(() => todayLocal());
  // Filtres client-side (sur la liste déjà chargée pour la période) : statut + recherche employé.
  const [statutFilter, setStatutFilter] = useState<CreditStatut | 'TOUTES'>('TOUTES');
  const [search, setSearch] = useState('');
  const sort = useTableSort<CreditSortCol>('/credits', CREDIT_SORT_COLUMNS);
  const { data: credits } = useCredits({
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    sortBy: sort.state.by ?? undefined,
    sortDir: sort.state.by ? sort.state.dir : undefined,
  });
  // Liste complète (non filtrée) : sert uniquement à détecter un crédit EN COURS
  // même s'il date d'un autre jour que celui affiché.
  const { data: allCredits } = useCredits();
  const [formOpen, setFormOpen] = useState(false);
  const { data: employes } = useEmployesSelectionnables();
  const { data: caisses } = useCaisses();
  const { data: portefeuilles } = usePortefeuilles();
  const { data: devises } = useDevises();
  const perms = useCreditPerms();
  const create = useCreateCredit();
  const solder = useSolderCredit();
  const approuver = useApprouverCredit();
  const rejeter = useRejeterCredit();
  const annuler = useAnnulerCredit();
  const traiter = useTraiterCredit();

  const [employeId, setEmployeId] = useState('');
  const [montant, setMontant] = useState('');
  const [nbMois, setNbMois] = useState('12');
  const [sourceType, setSourceType] = useState<CreditSource>('CAISSE');
  const [sourceId, setSourceId] = useState('');
  const [commentaire, setCommentaire] = useState('');
  const [editing, setEditing] = useState<Credit | null>(null);
  // Confirmations d'actions du workflow.
  const [confirmAction, setConfirmAction] = useState<
    { credit: Credit; type: 'APPROUVER' | 'DECAISSER' | 'ANNULER' | 'SOLDER' } | null
  >(null);
  const [rejectTarget, setRejectTarget] = useState<Credit | null>(null);
  const [rejectComment, setRejectComment] = useState('');
  // Échéancier d'un crédit (double-clic sur une ligne).
  const [scheduleCredit, setScheduleCredit] = useState<Credit | null>(null);

  // Employés proposés : ceux de la direction de l'utilisateur (tous pour un admin).
  const employesList = useMemo(() => {
    const list = employes ?? [];
    if (!currentUser?.directionId) return list;
    // Un admin verra quand même tout côté serveur ; ici on aide le validateur.
    const mine = list.filter((e) => String(e.directionId ?? '') === String(currentUser.directionId));
    return mine.length > 0 ? mine : list;
  }, [employes, currentUser]);

  const employeById = useMemo(() => new Map((employes ?? []).map((e) => [e.id, e])), [employes]);
  const codeOf = (deviseId?: string | null) => (devises ?? []).find((d) => d.id === deviseId)?.code ?? '';

  // Source de l'argent restreinte à la DIRECTION de l'employé choisi :
  //  - portefeuilles dont le propriétaire est cette direction ;
  //  - caisses = caisses sources (ouvertes) de ces portefeuilles.
  const selectedEmploye = employeId ? (employeById.get(employeId) ?? null) : null;
  const employeDirectionId = selectedEmploye?.directionId ?? null;

  const sourcePortefeuilles = useMemo(
    () =>
      employeDirectionId
        ? (portefeuilles ?? []).filter(
            (p) => p.estActif && p.proprietaireType === 'DIRECTION' && String(p.proprietaireId) === String(employeDirectionId),
          )
        : [],
    [portefeuilles, employeDirectionId],
  );
  const sourceCaisses = useMemo(() => {
    const ids = new Set(sourcePortefeuilles.map((p) => p.caisseSourceId));
    return (caisses ?? []).filter((c) => c.statut === 'OUVERTE' && ids.has(c.id));
  }, [sourcePortefeuilles, caisses]);
  const sourceOptions = sourceType === 'CAISSE' ? sourceCaisses : sourcePortefeuilles;

  // À la sélection d'un employé : pré-remplir avec son portefeuille source par
  // défaut s'il appartient bien à sa direction ; sinon vider la source.
  useEffect(() => {
    if (!selectedEmploye) {
      setSourceId('');
      return;
    }
    const def = selectedEmploye.portefeuilleSourceId;
    if (def && sourcePortefeuilles.some((p) => String(p.id) === String(def))) {
      setSourceType('PORTEFEUILLE');
      setSourceId(String(def));
    } else {
      setSourceId('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeId, sourcePortefeuilles]);

  // Alerte : l'employé a-t-il déjà une demande ou un crédit ACTIF (attente/approuvé/en cours) ?
  const creditActif = useMemo(
    () =>
      (allCredits ?? []).find(
        (c) => c.employeId === employeId && ['EN_ATTENTE', 'APPROUVEE', 'EN_COURS'].includes(c.statut),
      ),
    [allCredits, employeId],
  );

  const valid = employeId && Number(montant) > 0 && Number(nbMois) >= 1 && sourceId && !creditActif;

  const resetForm = () => {
    setMontant('');
    setNbMois('12');
    setSourceId('');
    setCommentaire('');
  };

  // Ouvre le formulaire en repartant à ZÉRO (l'état vit dans la page → sinon la
  // saisie précédente reste quand on ferme puis rouvre).
  const openForm = () => {
    setEmployeId('');
    setSourceType('CAISSE');
    resetForm();
    create.reset();
    setFormOpen(true);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    create.mutate(
      { employeId, montant, nbMois: Number(nbMois), sourceType, sourceId, commentaire: commentaire.trim() || undefined },
      { onSuccess: () => { setEmployeId(''); resetForm(); setFormOpen(false); } },
    );
  };

  const empLabel = (id: string) => {
    const e = employeById.get(id);
    return e ? `${e.nom} ${e.prenoms} — ${e.matricule}` : id;
  };
  const sourceLabel = (c: Credit) => {
    if (c.sourceType === 'CAISSE') return (caisses ?? []).find((x) => x.id === c.sourceId)?.code ?? 'Caisse';
    return (portefeuilles ?? []).find((x) => x.id === c.sourceId)?.code ?? 'Portefeuille';
  };

  // Filtrage : statut + recherche. Dès qu'un statut (≠ Tous) ou une recherche est
  // actif, on cherche dans TOUT l'historique (on ignore la date, comme la page
  // Opérations) → pas besoin de régler la date d'abord. Sinon, on reste sur la
  // période choisie.
  const rechercheGlobale = statutFilter !== 'TOUTES' || search.trim().length > 0;
  const filteredCredits = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = rechercheGlobale ? (allCredits ?? []) : (credits ?? []);
    return base.filter(
      (c) =>
        (statutFilter === 'TOUTES' || c.statut === statutFilter) &&
        (!q || empLabel(c.employeId).toLowerCase().includes(q) || sourceLabel(c).toLowerCase().includes(q)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [credits, allCredits, rechercheGlobale, statutFilter, search, employeById, caisses, portefeuilles]);

  type ConfirmType = 'APPROUVER' | 'DECAISSER' | 'ANNULER' | 'SOLDER';
  const ACTION_LABELS: Record<ConfirmType, { title: string; desc: string; label: string }> = {
    APPROUVER: {
      title: 'Approuver cette demande ?',
      desc: 'La demande passera en « Approuvée » et pourra ensuite être décaissée par un caissier.',
      label: 'Approuver',
    },
    DECAISSER: {
      title: 'Décaisser ce crédit ?',
      desc: "L'argent sera réellement décaissé de la source (opération CREDIT). Le crédit passe « En cours ».",
      label: 'Décaisser',
    },
    ANNULER: {
      title: 'Annuler cette demande ?',
      desc: "La demande sera annulée ; l'employé pourra en refaire une.",
      label: 'Annuler la demande',
    },
    SOLDER: {
      title: 'Solder ce crédit ?',
      desc: "Le crédit sera clôturé (aucun remboursement n'est enregistré ici).",
      label: 'Solder',
    },
  };
  const actionMut = (t: ConfirmType) =>
    t === 'APPROUVER' ? approuver : t === 'DECAISSER' ? traiter : t === 'ANNULER' ? annuler : solder;
  const curMut = confirmAction ? actionMut(confirmAction.type) : null;

  return (
    <div className="flex flex-col gap-4">
      {formOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center"
          onClick={() => setFormOpen(false)}
        >
          <div className="w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <Panel>
              <PanelHeader title="Nouvelle demande de crédit">
                <button
                  type="button"
                  aria-label="Fermer"
                  onClick={() => setFormOpen(false)}
                  className="ml-auto flex h-7 w-7 items-center justify-center rounded-[7px] text-[#94A3B8] hover:bg-[#F1F5F9] hover:text-[#0F172A]"
                >
                  <X className="h-4 w-4" />
                </button>
              </PanelHeader>
              <form onSubmit={submit} className="grid gap-4 p-[18px] sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label className={labelClass}>Employé</label>
            <select className={selectClass} value={employeId} onChange={(e) => setEmployeId(e.target.value)}>
              <option value="">— Choisir —</option>
              {employesList.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nom} {e.prenoms} — {e.matricule}
                </option>
              ))}
            </select>
            {creditActif && (
              <div className="flex items-center gap-2 rounded-[9px] border border-[#FDE68A] bg-[#FEF9C3] px-3 py-2 text-[12px] text-[#92400E]">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Cet employé a déjà une demande ou un crédit actif ({STATUT_META[creditActif.statut].label},{' '}
                {formatMontant(creditActif.montant)} {codeOf(creditActif.deviseId)}). Traitez-le d'abord.
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className={labelClass}>Montant</label>
            <input
              type="number" min="0" step="1"
              className={selectClass}
              value={montant}
              onChange={(e) => setMontant(e.target.value)}
              placeholder="Ex : 500000"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={labelClass}>Nombre de mois</label>
            <input
              type="number" min="1" step="1"
              className={selectClass}
              value={nbMois}
              onChange={(e) => setNbMois(e.target.value)}
            />
            {Number(montant) > 0 && Number(nbMois) >= 1 && (
              <p className="text-[11px] text-[#64748B]">
                Mensualité ≈ <strong>{formatMontant(mensualite(montant, Number(nbMois)))}</strong> / mois
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className={labelClass}>Source de l'argent</label>
            <div className="inline-flex rounded-[9px] border border-[rgba(15,76,129,0.12)] p-0.5">
              {(['CAISSE', 'PORTEFEUILLE'] as CreditSource[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => { setSourceType(s); setSourceId(''); }}
                  className={`flex-1 rounded-[7px] px-3 py-1.5 text-xs font-medium transition ${
                    sourceType === s ? 'bg-[#0F4C81] text-white' : 'text-[#475569] hover:bg-[#F1F5F9]'
                  }`}
                >
                  {s === 'CAISSE' ? 'Caisse' : 'Portefeuille'}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={labelClass}>{sourceType === 'CAISSE' ? 'Caisse' : 'Portefeuille'}</label>
            <select
              className={selectClass}
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value)}
              disabled={!employeId || sourceOptions.length === 0}
            >
              <option value="">— Choisir —</option>
              {sourceOptions.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.code} — {x.libelle}
                </option>
              ))}
            </select>
            {!employeId ? (
              <p className="text-[11px] text-[#94A3B8]">Choisissez d'abord un employé.</p>
            ) : !employeDirectionId ? (
              <p className="text-[11px] text-[#B45309]">Cet employé n'a pas de direction — aucune source rattachée.</p>
            ) : sourceOptions.length === 0 ? (
              <p className="text-[11px] text-[#B45309]">
                {sourceType === 'CAISSE'
                  ? 'Aucune caisse ouverte rattachée à sa direction.'
                  : 'Aucun portefeuille rattaché à sa direction.'}
              </p>
            ) : (
              <p className="text-[11px] text-[#94A3B8]">Limité à la direction de l'employé.</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label className={labelClass}>Commentaire (optionnel)</label>
            <input className={selectClass} value={commentaire} onChange={(e) => setCommentaire(e.target.value)} />
          </div>

          <div className="flex items-center gap-3 sm:col-span-2">
            <button
              type="submit"
              disabled={!valid || create.isPending}
              className="inline-flex items-center gap-1.5 rounded-[9px] bg-[#0F4C81] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#1A6DB5] disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              {create.isPending ? 'Envoi…' : 'Envoyer la demande'}
            </button>
            {create.isError && (
              <span className="text-sm text-destructive">{apiErrorMessage(create.error, 'Demande impossible')}</span>
            )}
          </div>
              </form>
            </Panel>
          </div>
        </div>
      )}

      <Panel>
        <PanelHeader title="Crédits" badge={`${credits?.length ?? 0}`}>
          {perms.canDemander && (
            <button
              type="button"
              onClick={openForm}
              className="ml-auto flex items-center gap-1.5 rounded-[9px] bg-[#0F4C81] px-3.5 py-2 text-xs font-medium text-white transition hover:bg-[#1A6DB5]"
            >
              <Plus className="h-4 w-4" /> Nouvelle demande
            </button>
          )}
        </PanelHeader>

        {/* Filtre par date (serveur) — défaut : aujourd'hui */}
        <div className="flex flex-wrap items-center gap-2 border-b border-[rgba(15,76,129,0.07)] px-[18px] py-3">
          <div className="flex items-center gap-1.5 rounded-[9px] border border-[rgba(15,76,129,0.12)] bg-white px-2.5 py-1.5 text-xs">
            <CalendarRange className="h-3.5 w-3.5 text-[#64748B]" />
            <input
              type="date"
              aria-label="Du"
              title="Du"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="border-0 bg-transparent text-xs text-[#0F172A] outline-none"
            />
            <span className="text-[#64748B]">au</span>
            <input
              type="date"
              aria-label="Au"
              title="Au"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="border-0 bg-transparent text-xs text-[#0F172A] outline-none"
            />
          </div>
          {(dateFrom !== today || dateTo !== today) && (
            <button
              type="button"
              onClick={() => {
                setDateFrom(today);
                setDateTo(today);
              }}
              title="Revenir aux crédits du jour"
              className="rounded-[9px] border border-[rgba(15,76,129,0.12)] bg-white px-3 py-1.5 text-xs font-medium text-[#475569] hover:bg-[#F1F5F9]"
            >
              Aujourd'hui
            </button>
          )}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher (employé, source)…"
            className="w-52 rounded-[9px] border border-[rgba(15,76,129,0.12)] bg-white px-3 py-1.5 text-xs text-[#0F172A] outline-none focus:border-[#1A6DB5]"
          />
          <span className="ml-auto flex items-center gap-2 text-[11px] text-[#64748B]">
            {rechercheGlobale && (
              <span className="rounded-full bg-[#EFF6FF] px-2 py-0.5 font-medium text-[#1A6DB5]">
                tout l'historique (date ignorée)
              </span>
            )}
            {filteredCredits.length} résultat{filteredCredits.length > 1 ? 's' : ''}
          </span>
        </div>

        {/* Filtre par statut */}
        <div className="flex flex-wrap gap-1.5 border-b border-[rgba(15,76,129,0.07)] px-[18px] py-2.5">
          {(
            [
              ['TOUTES', 'Tous'],
              ['EN_ATTENTE', STATUT_META.EN_ATTENTE.label],
              ['APPROUVEE', STATUT_META.APPROUVEE.label],
              ['EN_COURS', STATUT_META.EN_COURS.label],
              ['SOLDE', STATUT_META.SOLDE.label],
              ['REJETEE', STATUT_META.REJETEE.label],
              ['ANNULEE', STATUT_META.ANNULEE.label],
            ] as [CreditStatut | 'TOUTES', string][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setStatutFilter(key)}
              className={
                statutFilter === key
                  ? 'rounded-full bg-[#0F4C81] px-3 py-1 text-[11px] font-medium text-white'
                  : 'rounded-full border border-[rgba(15,76,129,0.15)] px-3 py-1 text-[11px] font-medium text-[#475569] hover:bg-[#F1F5F9]'
              }
            >
              {label}
            </button>
          ))}
        </div>

        <table className="w-full text-xs">
          <thead className="bg-[#F8FAFC]">
            <tr className="text-left text-[10px] uppercase tracking-[0.7px] text-[#64748B]">
              <SortableHeader column="dateDebut" state={sort.state} onSort={sort.setSort}>Date</SortableHeader>
              <th className="px-4 py-2.5 font-semibold">Employé</th>
              <SortableHeader column="montant" state={sort.state} onSort={sort.setSort} align="right">Montant</SortableHeader>
              <th className="px-4 py-2.5 font-semibold text-center">Mois</th>
              <th className="px-4 py-2.5 font-semibold text-right">Mensualité</th>
              <th className="px-4 py-2.5 font-semibold">Source</th>
              <th className="px-4 py-2.5 font-semibold">Fin prévue</th>
              <SortableHeader column="statut" state={sort.state} onSort={sort.setSort}>Statut</SortableHeader>
              <th className="px-4 py-2.5"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {filteredCredits.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-[#64748B]">
                  {search || statutFilter !== 'TOUTES'
                    ? 'Aucun crédit ne correspond aux filtres.'
                    : dateFrom !== today || dateTo !== today
                      ? 'Aucun crédit pour ces dates.'
                      : "Aucun crédit aujourd'hui."}
                </td>
              </tr>
            )}
            {filteredCredits.map((c) => (
              <tr
                key={c.id}
                onDoubleClick={() => setScheduleCredit(c)}
                title="Double-cliquez pour voir l'échéancier"
                className="cursor-pointer border-t border-[rgba(15,76,129,0.07)] hover:bg-[#F8FAFC]"
              >
                <td className="px-4 py-3 whitespace-nowrap text-[#64748B]">{new Date(c.dateDebut).toLocaleDateString('fr-FR')}</td>
                <td className="px-4 py-3">{empLabel(c.employeId)}</td>
                <td className="px-4 py-3 text-right font-medium">{formatMontant(c.montant)} {codeOf(c.deviseId)}</td>
                <td className="px-4 py-3 text-center">{c.nbMois}</td>
                <td className="px-4 py-3 text-right text-[#64748B]">{formatMontant(mensualite(c.montant, c.nbMois))}</td>
                <td className="px-4 py-3 text-[#64748B]">{sourceLabel(c)}</td>
                <td className="px-4 py-3 text-[#64748B]">{dateFin(c.dateDebut, c.nbMois)}</td>
                <td className="px-4 py-3">
                  <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUT_META[c.statut].cls}`}>
                    {STATUT_META[c.statut].label}
                  </span>
                  {c.statut === 'REJETEE' && c.commentaireValidation && (
                    <div className="mt-0.5 max-w-[160px] truncate text-[10px] text-[#94A3B8]" title={c.commentaireValidation}>
                      {c.commentaireValidation}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    {/* EN_ATTENTE : DAF approuve/rejette */}
                    {c.statut === 'EN_ATTENTE' && perms.canValider && (
                      <>
                        <button
                          type="button"
                          onClick={() => setConfirmAction({ credit: c, type: 'APPROUVER' })}
                          className="inline-flex items-center gap-1 rounded-[7px] border border-[rgba(15,76,129,0.15)] px-2 py-1 text-[11px] font-medium text-[#047857] hover:bg-[#ECFDF5]"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" /> Approuver
                        </button>
                        <button
                          type="button"
                          onClick={() => { setRejectTarget(c); setRejectComment(''); }}
                          className="inline-flex items-center gap-1 rounded-[7px] border border-[rgba(15,76,129,0.15)] px-2 py-1 text-[11px] font-medium text-[#B42318] hover:bg-[#FEF3F2]"
                        >
                          <XCircle className="h-3.5 w-3.5" /> Rejeter
                        </button>
                      </>
                    )}
                    {/* EN_ATTENTE : le demandeur modifie / annule */}
                    {c.statut === 'EN_ATTENTE' &&
                      perms.canDemander &&
                      (perms.isAdmin || String(c.createdById ?? '') === String(perms.userId ?? '')) && (
                        <>
                          <button
                            type="button"
                            aria-label="Modifier"
                            onClick={() => setEditing(c)}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-[7px] text-[#94A3B8] hover:bg-[#EFF6FF] hover:text-[#1A6DB5]"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            aria-label="Annuler"
                            onClick={() => setConfirmAction({ credit: c, type: 'ANNULER' })}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-[7px] text-[#94A3B8] hover:bg-[#FEF3F2] hover:text-[#B42318]"
                          >
                            <Ban className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    {/* APPROUVEE : le caissier décaisse */}
                    {c.statut === 'APPROUVEE' && perms.canDecaisser && (
                      <button
                        type="button"
                        onClick={() => setConfirmAction({ credit: c, type: 'DECAISSER' })}
                        className="inline-flex items-center gap-1 rounded-[7px] bg-[#0F4C81] px-2.5 py-1 text-[11px] font-medium text-white hover:bg-[#1A6DB5]"
                      >
                        <Banknote className="h-3.5 w-3.5" /> Décaisser
                      </button>
                    )}
                    {/* EN_COURS : solder */}
                    {c.statut === 'EN_COURS' && perms.canValider && (
                      <button
                        type="button"
                        onClick={() => setConfirmAction({ credit: c, type: 'SOLDER' })}
                        className="inline-flex items-center gap-1 rounded-[7px] border border-[rgba(15,76,129,0.15)] px-2 py-1 text-[11px] font-medium text-[#0F4C81] hover:bg-[#EFF6FF]"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" /> Solder
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      {editing && <EditCreditModal credit={editing} onClose={() => setEditing(null)} />}

      {scheduleCredit && (
        <CreditScheduleModal
          credit={scheduleCredit}
          employeLabel={empLabel(scheduleCredit.employeId)}
          deviseCode={codeOf(scheduleCredit.deviseId)}
          sourceLabel={sourceLabel(scheduleCredit)}
          autres={(allCredits ?? credits ?? []).filter(
            (x) => x.employeId === scheduleCredit.employeId && x.id !== scheduleCredit.id,
          )}
          codeOf={codeOf}
          onSelect={setScheduleCredit}
          onClose={() => setScheduleCredit(null)}
        />
      )}

      <ConfirmDialog
        open={!!confirmAction}
        title={confirmAction ? ACTION_LABELS[confirmAction.type].title : ''}
        description={confirmAction ? ACTION_LABELS[confirmAction.type].desc : undefined}
        confirmLabel={confirmAction ? ACTION_LABELS[confirmAction.type].label : undefined}
        busy={curMut?.isPending}
        error={curMut?.isError ? apiErrorMessage(curMut.error, 'Échec') : undefined}
        onCancel={() => { curMut?.reset(); setConfirmAction(null); }}
        onConfirm={() => {
          if (!confirmAction) return;
          actionMut(confirmAction.type).mutate(confirmAction.credit.id, {
            onSuccess: () => setConfirmAction(null),
          });
        }}
      />

      {/* Rejet d'une demande avec motif */}
      {rejectTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setRejectTarget(null)}
        >
          <div
            className="w-full max-w-md rounded-[13px] border border-[rgba(15,76,129,0.1)] bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[rgba(15,76,129,0.07)] bg-[#F8FAFC] px-5 py-3">
              <span className="font-display text-sm font-semibold text-[#0F172A]">Rejeter la demande</span>
              <button type="button" aria-label="Fermer" onClick={() => setRejectTarget(null)} className="text-[#94A3B8] hover:text-[#0F172A]">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3 p-5">
              <div className="space-y-1.5">
                <label className={labelClass}>Motif (optionnel)</label>
                <textarea
                  rows={3}
                  className="w-full rounded-[9px] border border-[rgba(15,76,129,0.1)] bg-white px-3 py-2 text-sm text-[#0F172A] outline-none focus:border-[#1A6DB5]"
                  value={rejectComment}
                  onChange={(e) => setRejectComment(e.target.value)}
                  placeholder="Raison du rejet…"
                />
              </div>
              {rejeter.isError && (
                <p className="text-sm text-destructive">{apiErrorMessage(rejeter.error, 'Échec du rejet')}</p>
              )}
              <div className="flex items-center justify-end gap-2">
                <button type="button" onClick={() => setRejectTarget(null)} className="rounded-[9px] px-4 py-2 text-sm text-[#475569] hover:bg-[#F1F5F9]">
                  Annuler
                </button>
                <button
                  type="button"
                  disabled={rejeter.isPending}
                  onClick={() =>
                    rejeter.mutate(
                      { id: rejectTarget.id, commentaire: rejectComment.trim() || undefined },
                      { onSuccess: () => setRejectTarget(null) },
                    )
                  }
                  className="rounded-[9px] bg-[#B42318] px-4 py-2 text-sm font-medium text-white hover:bg-[#991B1B] disabled:opacity-50"
                >
                  {rejeter.isPending ? 'Rejet…' : 'Rejeter'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* --------------------------- Échéancier d'un crédit --------------------------- */

type EcheanceStatut = 'SOLDE' | 'EN_COURS' | 'A_VENIR';
interface Echeance {
  index: number;
  date: Date;
  montant: number;
  statut: EcheanceStatut;
}

/**
 * Construit l'échéancier mois par mois. Aucun remboursement n'est stocké en base :
 * on déduit le statut de chaque mensualité de la date d'échéance vs aujourd'hui.
 *  - crédit SOLDE   → toutes les mensualités soldées ;
 *  - crédit EN_COURS → échéance passée = soldée, la 1re à venir = « en cours », le reste = à venir ;
 *  - crédit non décaissé (attente/approuvé) → prévisionnel, tout « à venir ».
 */
function buildEcheancier(c: Credit): Echeance[] {
  const start = new Date(c.dateDebut);
  const mens = mensualite(c.montant, c.nbMois);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const rows: Echeance[] = [];
  let enCoursMarque = false;
  for (let i = 1; i <= c.nbMois; i++) {
    const d = new Date(start);
    d.setMonth(d.getMonth() + i);
    let statut: EcheanceStatut = 'A_VENIR';
    if (c.statut === 'SOLDE') {
      statut = 'SOLDE';
    } else if (c.statut === 'EN_COURS') {
      if (d.getTime() <= now.getTime()) statut = 'SOLDE';
      else if (!enCoursMarque) {
        statut = 'EN_COURS';
        enCoursMarque = true;
      }
    }
    rows.push({ index: i, date: d, montant: mens, statut });
  }
  return rows;
}

const ECH_META: Record<EcheanceStatut, { label: string; cls: string; dot: string }> = {
  SOLDE: { label: 'Soldé', cls: 'text-[#047857]', dot: 'bg-[#047857]' },
  EN_COURS: { label: 'En cours', cls: 'text-[#1A6DB5]', dot: 'bg-[#1A6DB5]' },
  A_VENIR: { label: 'À solder', cls: 'text-[#94A3B8]', dot: 'bg-[#CBD5E1]' },
};

function CreditScheduleModal({
  credit,
  employeLabel,
  deviseCode,
  sourceLabel,
  autres,
  codeOf,
  onSelect,
  onClose,
}: {
  credit: Credit;
  employeLabel: string;
  deviseCode: string;
  sourceLabel: string;
  autres: Credit[];
  codeOf: (deviseId?: string | null) => string;
  onSelect: (c: Credit) => void;
  onClose: () => void;
}) {
  const decaisse = credit.statut === 'EN_COURS' || credit.statut === 'SOLDE';
  const ech = useMemo(() => (decaisse ? buildEcheancier(credit) : []), [credit, decaisse]);
  const mens = mensualite(credit.montant, credit.nbMois);
  const nbSoldes = ech.filter((e) => e.statut === 'SOLDE').length;
  const rembourse = nbSoldes * mens;
  const restant = Number(credit.montant || 0) - rembourse;
  const pct = credit.nbMois > 0 ? Math.round((nbSoldes / credit.nbMois) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-lg rounded-[13px] border border-[rgba(15,76,129,0.1)] bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[rgba(15,76,129,0.07)] bg-[#F8FAFC] px-5 py-3">
          <div>
            <div className="font-display text-sm font-semibold text-[#0F172A]">Échéancier du crédit</div>
            <div className="text-[11px] text-[#64748B]">{employeLabel}</div>
          </div>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUT_META[credit.statut].cls}`}>
            {STATUT_META[credit.statut].label}
          </span>
          <button type="button" aria-label="Fermer" onClick={onClose} className="ml-2 text-[#94A3B8] hover:text-[#0F172A]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {/* Résumé */}
          <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
            <Info label="Montant" value={`${formatMontant(credit.montant)} ${deviseCode}`} />
            <Info label="Mensualité" value={`${formatMontant(mens)} ${deviseCode}`} />
            <Info label="Durée" value={`${credit.nbMois} mois`} />
            <Info label="Source" value={sourceLabel} />
            <Info label="Début" value={new Date(credit.dateDebut).toLocaleDateString('fr-FR')} />
            <Info label="Fin prévue" value={dateFin(credit.dateDebut, credit.nbMois)} />
          </div>

          {decaisse ? (
            <>
              {/* Progression */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-[#64748B]">
                  <span>
                    <strong className="text-[#0F172A]">{nbSoldes}</strong> / {credit.nbMois} mois soldés
                  </span>
                  <span>
                    Remboursé <strong className="text-[#047857]">{formatMontant(rembourse)}</strong> · Reste{' '}
                    <strong className="text-[#B45309]">{formatMontant(restant)}</strong> {deviseCode}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-[#F1F5F9]">
                  <div className="h-full rounded-full bg-[#047857]" style={{ width: `${pct}%` }} />
                </div>
              </div>

              {/* Détail mois par mois */}
              <div className="max-h-64 overflow-y-auto rounded-[9px] border border-[rgba(15,76,129,0.08)]">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-[#F8FAFC]">
                    <tr className="text-left text-[10px] uppercase tracking-[0.6px] text-[#64748B]">
                      <th className="px-3 py-2 font-semibold">Mois</th>
                      <th className="px-3 py-2 font-semibold">Échéance</th>
                      <th className="px-3 py-2 text-right font-semibold">Montant</th>
                      <th className="px-3 py-2 font-semibold">Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ech.map((e) => {
                      const m = ECH_META[e.statut];
                      return (
                        <tr key={e.index} className="border-t border-[rgba(15,76,129,0.06)]">
                          <td className="px-3 py-2 text-[#64748B]">{e.index}</td>
                          <td className="px-3 py-2 capitalize text-[#0F172A]">
                            {e.date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
                          </td>
                          <td className="px-3 py-2 text-right text-[#64748B]">{formatMontant(e.montant)}</td>
                          <td className={`px-3 py-2 font-medium ${m.cls}`}>
                            <span className="inline-flex items-center gap-1.5">
                              {e.statut === 'SOLDE' ? (
                                <CheckCircle2 className="h-3.5 w-3.5" />
                              ) : e.statut === 'EN_COURS' ? (
                                <Clock className="h-3.5 w-3.5" />
                              ) : (
                                <span className={`h-2 w-2 rounded-full ${m.dot}`} />
                              )}
                              {m.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="rounded-[9px] border border-[#FDE68A] bg-[#FEF9C3] px-3 py-2.5 text-[12px] text-[#92400E]">
              Ce crédit n'est pas encore décaissé ({STATUT_META[credit.statut].label}) — l'échéancier démarrera au
              décaissement.
            </div>
          )}

          {/* Autres crédits de l'employé */}
          {autres.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.6px] text-[#64748B]">
                Autres crédits de cet employé ({autres.length})
              </div>
              <div className="flex flex-col gap-1">
                {autres.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => onSelect(a)}
                    className="flex items-center justify-between rounded-[8px] border border-[rgba(15,76,129,0.08)] px-3 py-1.5 text-left text-xs hover:bg-[#F8FAFC]"
                  >
                    <span className="text-[#64748B]">{new Date(a.dateDebut).toLocaleDateString('fr-FR')}</span>
                    <span className="font-medium text-[#0F172A]">
                      {formatMontant(a.montant)} {codeOf(a.deviseId)} · {a.nbMois} mois
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUT_META[a.statut].cls}`}>
                      {STATUT_META[a.statut].label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[9px] bg-[#F8FAFC] px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.6px] text-[#94A3B8]">{label}</div>
      <div className="mt-0.5 truncate font-medium text-[#0F172A]" title={value}>{value}</div>
    </div>
  );
}

function EditCreditModal({ credit, onClose }: { credit: Credit; onClose: () => void }) {
  const update = useUpdateCredit();
  const [montant, setMontant] = useState(credit.montant);
  const [nbMois, setNbMois] = useState(String(credit.nbMois));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    update.mutate(
      { id: credit.id, payload: { montant, nbMois: Number(nbMois) } },
      { onSuccess: onClose },
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-[13px] border border-[rgba(15,76,129,0.1)] bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[rgba(15,76,129,0.07)] bg-[#F8FAFC] px-5 py-3">
          <span className="font-display text-sm font-semibold text-[#0F172A]">Modifier la demande</span>
          <button type="button" aria-label="Fermer" onClick={onClose} className="text-[#94A3B8] hover:text-[#0F172A]">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={submit} className="grid gap-4 p-5">
          <div className="flex flex-col gap-1.5">
            <label className={labelClass}>Montant</label>
            <input type="number" min="0" step="1" className={selectClass} value={montant} onChange={(e) => setMontant(e.target.value)} />
            <p className="text-[11px] text-[#94A3B8]">
              Modification possible tant que la demande est en attente (rien n'est encore décaissé).
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={labelClass}>Nombre de mois</label>
            <input type="number" min="1" step="1" className={selectClass} value={nbMois} onChange={(e) => setNbMois(e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <button type="submit" disabled={update.isPending} className="rounded-[9px] bg-[#0F4C81] px-4 py-2 text-sm font-medium text-white hover:bg-[#1A6DB5] disabled:opacity-50">
              {update.isPending ? 'Enregistrement…' : 'Enregistrer'}
            </button>
            <button type="button" onClick={onClose} className="rounded-[9px] px-4 py-2 text-sm text-[#475569] hover:bg-[#F1F5F9]">
              Annuler
            </button>
            {update.isError && <span className="text-sm text-destructive">{apiErrorMessage(update.error, 'Échec')}</span>}
          </div>
        </form>
      </div>
    </div>
  );
}
