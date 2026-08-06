import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Ban, Banknote, CalendarRange, CheckCircle2, Download, Pencil, Plus, Send, X, XCircle } from 'lucide-react';
import {
  useCredits,
  useCreateCredit,
  useUpdateCredit,
  useSolderCredit,
  useApprouverCredit,
  useRejeterCredit,
  useAnnulerCredit,
  useTraiterCredit,
  useCreditSituations,
  exportCredits,
  useCreditRemboursements,
  useEnregistrerRemboursement,
  useAnnulerRemboursement,
} from '@/api/credits';
import { useEmployesSelectionnables } from '@/api/employes';
import { useCaisses } from '@/api/caisses';
import { usePortefeuilles, useDevises } from '@/api/financierRef';
import { useDirections } from '@/api/directions';
import { useUserRoles, useMyPermissions } from '@/api/users';
import { useAuthStore } from '@/stores/auth.store';
import { apiErrorMessage, formatMontant } from '@/lib/utils';
import type { Credit, CreditSource, CreditStatut, Employe, SituationCredit } from '@/types/api';
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
    // Sans bypass admin : le backend vérifie CREDIT_REMBOURSER en mode strict
    // (encaisser touche à l'argent). Accorder le bouton à un admin qui n'a pas
    // la permission ne ferait que produire un 403 à l'écran.
    canRembourser: p.has('CREDIT_REMBOURSER'),
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

/**
 * Avancement d'un crédit : « 3 / 12 » + barre de progression, et le retard s'il
 * y en a. Les chiffres viennent du backend, calculés sur les versements
 * réellement encaissés — surtout ne pas les redéduire du calendrier ici.
 */
function AvancementCell({ situation, nbMois }: { situation?: SituationCredit; nbMois: number }) {
  if (!situation) return <span className="text-[#94A3B8]">—</span>;
  const enRetard = situation.echeancesEnRetard > 0;
  return (
    <div className="min-w-[92px] space-y-1">
      <div className="flex items-baseline gap-1.5">
        <span className="font-medium tabular-nums text-[#0F172A]">
          {situation.echeancesPayees} / {nbMois}
        </span>
        <span className="text-[10px] text-[#94A3B8]">mois</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#F1F5F9]">
        <div
          className={`h-full rounded-full ${enRetard ? 'bg-[#B45309]' : 'bg-[#047857]'}`}
          style={{ width: `${situation.pourcentage}%` }}
        />
      </div>
      {enRetard && (
        <div
          className="flex items-center gap-1 text-[10px] font-semibold text-[#B42318]"
          title={`${situation.echeancesEnRetard} échéance(s) échue(s) sans versement, soit ${formatMontant(situation.montantEnRetard)}`}
        >
          <AlertTriangle className="h-2.5 w-2.5" />
          {situation.echeancesEnRetard} mois de retard
        </div>
      )}
    </div>
  );
}

/**
 * Identité de l'employé dans la liste : nom en clair et matricule dessous.
 * Le matricule est ce qui permet de le retrouver dans SAP et sur la paie —
 * sans lui, deux homonymes sont indistinguables.
 */
function EmployeCell({ employe, fallback }: { employe?: Employe; fallback: string }) {
  if (!employe) return <span>{fallback}</span>;
  return (
    <div className="leading-tight">
      <div className="font-medium text-[#0F172A]">
        {employe.nom} {employe.prenoms}
      </div>
      <div className="text-[10px] text-[#94A3B8]">
        {employe.matricule}
        {!employe.estActif && <span className="ml-1 text-[#B42318]">· inactif</span>}
      </div>
    </div>
  );
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
  const [directionFilter, setDirectionFilter] = useState('');
  // « Seulement les retards » : la question que pose le boss en premier.
  const [retardSeul, setRetardSeul] = useState(false);
  const [exporting, setExporting] = useState(false);
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
  const { data: directions } = useDirections();
  const perms = useCreditPerms();
  const create = useCreateCredit();
  const solder = useSolderCredit();
  const approuver = useApprouverCredit();
  const rejeter = useRejeterCredit();
  const annuler = useAnnulerCredit();
  const traiter = useTraiterCredit();
  // Situations calculées par le backend sur les versements réellement encaissés.
  const { data: situations } = useCreditSituations();

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
  const directionById = useMemo(
    () => new Map((directions ?? []).map((d) => [String(d.id), d])),
    [directions],
  );
  /** Direction de l'employé porteur du crédit — la colonne demandée à l'écran. */
  const dirLabel = (employeId: string) => {
    const dirId = employeById.get(employeId)?.directionId;
    return dirId ? (directionById.get(String(dirId))?.libelle ?? '') : '';
  };
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
  const rechercheGlobale = statutFilter !== 'TOUTES' || search.trim().length > 0 || retardSeul;
  const filteredCredits = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = rechercheGlobale ? (allCredits ?? []) : (credits ?? []);
    return base.filter((c) => {
      if (statutFilter !== 'TOUTES' && c.statut !== statutFilter) return false;
      if (directionFilter && String(employeById.get(c.employeId)?.directionId ?? '') !== directionFilter) {
        return false;
      }
      // « En retard » : au moins une échéance échue sans versement. C'est le
      // backend qui le dit, à partir des versements réellement encaissés.
      if (retardSeul && (situations?.[c.id]?.echeancesEnRetard ?? 0) === 0) return false;
      if (!q) return true;
      return (
        empLabel(c.employeId).toLowerCase().includes(q) ||
        sourceLabel(c).toLowerCase().includes(q) ||
        dirLabel(c.employeId).toLowerCase().includes(q)
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    credits, allCredits, rechercheGlobale, statutFilter, search, employeById,
    caisses, portefeuilles, directionFilter, retardSeul, situations, directionById,
  ]);

  const nbEnRetard = useMemo(
    () =>
      (rechercheGlobale ? (allCredits ?? []) : (credits ?? [])).filter(
        (c) => (situations?.[c.id]?.echeancesEnRetard ?? 0) > 0,
      ).length,
    [credits, allCredits, rechercheGlobale, situations],
  );

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
            placeholder="Rechercher (employé, direction, source)…"
            className="w-56 rounded-[9px] border border-[rgba(15,76,129,0.12)] bg-white px-3 py-1.5 text-xs text-[#0F172A] outline-none focus:border-[#1A6DB5]"
          />
          <select
            value={directionFilter}
            onChange={(e) => setDirectionFilter(e.target.value)}
            aria-label="Filtrer par direction"
            title="Filtrer par direction"
            className="rounded-[9px] border border-[rgba(15,76,129,0.12)] bg-white px-2 py-1.5 text-xs text-[#0F172A] outline-none focus:border-[#1A6DB5]"
          >
            <option value="">Toutes les directions</option>
            {(directions ?? []).map((d) => (
              <option key={d.id} value={String(d.id)}>
                {d.libelle}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setRetardSeul((v) => !v)}
            title="N'afficher que les crédits dont une échéance est échue sans versement"
            className={`inline-flex items-center gap-1.5 rounded-[9px] border px-3 py-1.5 text-xs font-medium transition-colors ${
              retardSeul
                ? 'border-[#B42318] bg-[#FEF3F2] text-[#B42318]'
                : 'border-[rgba(15,76,129,0.12)] bg-white text-[#475569] hover:bg-[#F1F5F9]'
            }`}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            En retard
            {nbEnRetard > 0 && (
              <span className="rounded-full bg-[#B42318] px-1.5 text-[10px] font-bold text-white">
                {nbEnRetard}
              </span>
            )}
          </button>
          <button
            type="button"
            disabled={exporting}
            onClick={() => {
              setExporting(true);
              exportCredits({
                // Le fichier reprend exactement ce que la liste montre — sauf la
                // recherche texte, qui n'existe que côté écran.
                dateFrom: rechercheGlobale ? undefined : dateFrom || undefined,
                dateTo: rechercheGlobale ? undefined : dateTo || undefined,
                directionId: directionFilter || undefined,
                statut: statutFilter,
                enRetard: retardSeul,
                sortBy: sort.state.by ?? undefined,
                sortDir: sort.state.by ? sort.state.dir : undefined,
              }).finally(() => setExporting(false));
            }}
            title="Exporter les crédits filtrés vers Excel (.xlsx)"
            className="inline-flex items-center gap-1.5 rounded-[9px] border border-[rgba(15,76,129,0.12)] bg-white px-3 py-1.5 text-xs font-medium text-[#047857] hover:bg-[#ECFDF5] disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" /> {exporting ? 'Export…' : 'Exporter Excel'}
          </button>
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
              <th className="px-4 py-2.5 font-semibold">Direction</th>
              <SortableHeader column="montant" state={sort.state} onSort={sort.setSort} align="right">Montant</SortableHeader>
              <th className="px-4 py-2.5 font-semibold text-right">Mensualité</th>
              <th className="px-4 py-2.5 font-semibold">Avancement</th>
              <th className="px-4 py-2.5 font-semibold text-right">Remboursé</th>
              <th className="px-4 py-2.5 font-semibold text-right">Reste dû</th>
              <th className="px-4 py-2.5 font-semibold">Fin prévue</th>
              <SortableHeader column="statut" state={sort.state} onSort={sort.setSort}>Statut</SortableHeader>
              <th className="px-4 py-2.5"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {filteredCredits.length === 0 && (
              <tr>
                <td colSpan={11} className="px-4 py-10 text-center text-[#64748B]">
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
                <td className="px-4 py-3">
                  <EmployeCell employe={employeById.get(c.employeId)} fallback={empLabel(c.employeId)} />
                </td>
                <td className="px-4 py-3 text-[#64748B]">{dirLabel(c.employeId) || "—"}</td>
                <td className="px-4 py-3 text-right font-medium">{formatMontant(c.montant)} {codeOf(c.deviseId)}</td>
                <td className="px-4 py-3 text-right text-[#64748B]">{formatMontant(mensualite(c.montant, c.nbMois))}</td>
                <td className="px-4 py-3"><AvancementCell situation={situations?.[c.id]} nbMois={c.nbMois} /></td>
                <td className="px-4 py-3 text-right font-medium text-[#047857]">
                  {situations?.[c.id] ? formatMontant(situations[c.id].rembourse) : '—'}
                </td>
                <td className="px-4 py-3 text-right font-medium text-[#B45309]">
                  {situations?.[c.id] ? formatMontant(situations[c.id].restant) : '—'}
                </td>
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
          employe={employeById.get(scheduleCredit.employeId)}
          directionLabel={dirLabel(scheduleCredit.employeId)}
          deviseCode={codeOf(scheduleCredit.deviseId)}
          sourceLabel={sourceLabel(scheduleCredit)}
          canRembourser={perms.canRembourser}
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

type EcheanceStatut = 'PAYE' | 'EN_RETARD' | 'A_VENIR';
interface Echeance {
  index: number;
  date: Date;
  /** Montant attendu pour cette échéance. */
  attendu: number;
  /** Montant réellement encaissé, 0 si aucun versement. */
  verse: number;
  statut: EcheanceStatut;
  /** Identifiant du versement, pour pouvoir l'annuler. */
  remboursementId?: string;
}

/**
 * Construit l'échéancier en confrontant le calendrier aux versements RÉELLEMENT
 * encaissés.
 *
 * Auparavant une échéance passait pour soldée du seul fait que sa date était
 * dépassée : un employé en retard apparaissait à jour. Désormais une échéance
 * n'est payée que si un versement lui est rattaché ; échue sans versement, elle
 * est EN RETARD.
 */
function buildEcheancier(c: Credit, remboursements: CreditRemboursementVue[]): Echeance[] {
  const start = new Date(c.dateDebut);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const parRang = new Map(remboursements.filter((r) => r.statut === 'ENCAISSE').map((r) => [r.numeroEcheance, r]));
  const rows: Echeance[] = [];
  for (let i = 1; i <= c.nbMois; i++) {
    const d = new Date(start);
    d.setMonth(d.getMonth() + i);
    d.setHours(0, 0, 0, 0);
    const verse = parRang.get(i);
    let statut: EcheanceStatut = 'A_VENIR';
    if (verse) statut = 'PAYE';
    else if (c.statut === 'EN_COURS' && d.getTime() <= now.getTime()) statut = 'EN_RETARD';
    rows.push({
      index: i,
      date: d,
      attendu: mensualite(c.montant, c.nbMois),
      verse: verse ? Number(verse.montant || 0) : 0,
      statut,
      remboursementId: verse?.id,
    });
  }
  return rows;
}

/** Vue minimale d'un versement, telle que l'échéancier en a besoin. */
interface CreditRemboursementVue {
  id: string;
  numeroEcheance: number;
  montant: string;
  statut: 'ENCAISSE' | 'ANNULE';
}

const ECH_META: Record<EcheanceStatut, { label: string; cls: string; dot: string }> = {
  PAYE: { label: 'Payé', cls: 'text-[#047857]', dot: 'bg-[#047857]' },
  EN_RETARD: { label: 'En retard', cls: 'text-[#B42318]', dot: 'bg-[#B42318]' },
  A_VENIR: { label: 'À venir', cls: 'text-[#94A3B8]', dot: 'bg-[#CBD5E1]' },
};

function CreditScheduleModal({
  credit,
  employeLabel,
  employe,
  directionLabel,
  deviseCode,
  sourceLabel,
  autres,
  codeOf,
  canRembourser,
  onSelect,
  onClose,
}: {
  credit: Credit;
  employeLabel: string;
  employe?: Employe;
  /** Direction de l'employé — le boss regarde le crédit par direction. */
  directionLabel: string;
  deviseCode: string;
  sourceLabel: string;
  autres: Credit[];
  codeOf: (deviseId?: string | null) => string;
  /** Autorise la saisie et l'annulation des versements dans l'échéancier. */
  canRembourser: boolean;
  onSelect: (c: Credit) => void;
  onClose: () => void;
}) {
  const decaisse = credit.statut === 'EN_COURS' || credit.statut === 'SOLDE';
  const { data: remboursements } = useCreditRemboursements(decaisse ? credit.id : null);
  const enregistrer = useEnregistrerRemboursement();
  const annulerRemb = useAnnulerRemboursement();
  const [saisie, setSaisie] = useState<{ rang: number; montant: string } | null>(null);
  const [erreur, setErreur] = useState('');

  const ech = useMemo(
    () => (decaisse ? buildEcheancier(credit, remboursements ?? []) : []),
    [credit, decaisse, remboursements],
  );
  const mens = mensualite(credit.montant, credit.nbMois);
  // Chiffres tirés des versements réels, jamais du calendrier.
  const nbPayes = ech.filter((e) => e.statut === 'PAYE').length;
  const nbRetard = ech.filter((e) => e.statut === 'EN_RETARD').length;
  const rembourse = ech.reduce((s, e) => s + e.verse, 0);
  const restant = Math.max(0, Number(credit.montant || 0) - rembourse);
  const pct = Number(credit.montant || 0) > 0
    ? Math.min(100, Math.round((rembourse / Number(credit.montant)) * 100))
    : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-lg rounded-[13px] border border-[rgba(15,76,129,0.1)] bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[rgba(15,76,129,0.07)] bg-[#F8FAFC] px-5 py-3">
          <div>
            <div className="font-display text-sm font-semibold text-[#0F172A]">Échéancier du crédit</div>
            <div className="text-[11px] text-[#64748B]">
              {employe ? `${employe.nom} ${employe.prenoms}` : employeLabel}
              {employe?.matricule && <span className="ml-1.5 text-[#94A3B8]">· {employe.matricule}</span>}
              {directionLabel && <span className="ml-1.5 text-[#94A3B8]">· {directionLabel}</span>}
            </div>
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
              {/* Progression — fondée sur ce qui a réellement été encaissé */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-[#64748B]">
                  <span>
                    <strong className="text-[#0F172A]">{nbPayes}</strong> / {credit.nbMois} mois versés
                    {nbRetard > 0 && (
                      <span className="ml-2 font-semibold text-[#B42318]">
                        · {nbRetard} en retard
                      </span>
                    )}
                  </span>
                  <span>
                    Remboursé <strong className="text-[#047857]">{formatMontant(rembourse)}</strong> · Reste{' '}
                    <strong className="text-[#B45309]">{formatMontant(restant)}</strong> {deviseCode}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-[#F1F5F9]">
                  <div
                    className={`h-full rounded-full ${nbRetard > 0 ? 'bg-[#B45309]' : 'bg-[#047857]'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>

              {erreur && (
                <div className="rounded-[9px] border border-[#FECDCA] bg-[#FEF3F2] px-3 py-2 text-[12px] text-[#B42318]">
                  {erreur}
                </div>
              )}

              {/* Détail mois par mois : attendu vs réellement versé */}
              <div className="max-h-64 overflow-y-auto rounded-[9px] border border-[rgba(15,76,129,0.08)]">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-[#F8FAFC]">
                    <tr className="text-left text-[10px] uppercase tracking-[0.6px] text-[#64748B]">
                      <th className="px-3 py-2 font-semibold">Mois</th>
                      <th className="px-3 py-2 font-semibold">Échéance</th>
                      <th className="px-3 py-2 text-right font-semibold">Attendu</th>
                      <th className="px-3 py-2 text-right font-semibold">Versé</th>
                      <th className="px-3 py-2 font-semibold">Statut</th>
                      {canRembourser && <th className="px-3 py-2"><span className="sr-only">Actions</span></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {ech.map((e) => {
                      const m = ECH_META[e.statut];
                      const enSaisie = saisie?.rang === e.index;
                      return (
                        <tr key={e.index} className="border-t border-[rgba(15,76,129,0.06)]">
                          <td className="px-3 py-2 text-[#64748B]">{e.index}</td>
                          <td className="px-3 py-2 capitalize text-[#0F172A]">
                            {e.date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
                          </td>
                          <td className="px-3 py-2 text-right text-[#64748B]">{formatMontant(e.attendu)}</td>
                          <td className="px-3 py-2 text-right">
                            {enSaisie ? (
                              <input
                                autoFocus
                                inputMode="decimal"
                                value={saisie.montant}
                                onChange={(ev) => setSaisie({ rang: e.index, montant: ev.target.value })}
                                className="h-7 w-24 rounded-[6px] border border-[#1A6DB5] px-2 text-right text-xs outline-none"
                              />
                            ) : e.verse > 0 ? (
                              <span className="font-medium text-[#047857]">{formatMontant(e.verse)}</span>
                            ) : (
                              <span className="text-[#CBD5E1]">—</span>
                            )}
                          </td>
                          <td className={`px-3 py-2 font-medium ${m.cls}`}>
                            <span className="inline-flex items-center gap-1.5">
                              {e.statut === 'PAYE' ? (
                                <CheckCircle2 className="h-3.5 w-3.5" />
                              ) : e.statut === 'EN_RETARD' ? (
                                <AlertTriangle className="h-3.5 w-3.5" />
                              ) : (
                                <span className={`h-2 w-2 rounded-full ${m.dot}`} />
                              )}
                              {m.label}
                            </span>
                          </td>
                          {canRembourser && (
                            <td className="px-3 py-2 text-right whitespace-nowrap">
                              {enSaisie ? (
                                <span className="inline-flex gap-1">
                                  <button
                                    type="button"
                                    disabled={enregistrer.isPending}
                                    onClick={() => {
                                      setErreur('');
                                      enregistrer.mutate(
                                        {
                                          creditId: credit.id,
                                          payload: { numeroEcheance: e.index, montant: saisie.montant },
                                        },
                                        {
                                          onSuccess: () => setSaisie(null),
                                          onError: (err) => setErreur(apiErrorMessage(err)),
                                        },
                                      );
                                    }}
                                    className="rounded-[6px] bg-[#047857] px-2 py-1 text-[10px] font-semibold text-white hover:bg-[#065F46] disabled:opacity-50"
                                  >
                                    {enregistrer.isPending ? '…' : 'Valider'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => { setSaisie(null); setErreur(''); }}
                                    className="rounded-[6px] border border-[rgba(15,76,129,0.15)] px-2 py-1 text-[10px] text-[#64748B] hover:bg-[#F8FAFC]"
                                  >
                                    Annuler
                                  </button>
                                </span>
                              ) : e.statut === 'PAYE' ? (
                                <button
                                  type="button"
                                  title="Annuler ce versement (contre-passation comptable)"
                                  disabled={annulerRemb.isPending}
                                  onClick={() => {
                                    setErreur('');
                                    annulerRemb.mutate(
                                      { rembId: e.remboursementId as string, motif: 'Saisie erronée' },
                                      { onError: (err) => setErreur(apiErrorMessage(err)) },
                                    );
                                  }}
                                  className="rounded-[6px] border border-[rgba(15,76,129,0.15)] px-2 py-1 text-[10px] text-[#B42318] hover:bg-[#FEF3F2] disabled:opacity-50"
                                >
                                  Annuler
                                </button>
                              ) : credit.statut === 'EN_COURS' ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setErreur('');
                                    setSaisie({ rang: e.index, montant: String(e.attendu.toFixed(2)) });
                                  }}
                                  className="rounded-[6px] border border-[rgba(15,76,129,0.15)] px-2 py-1 text-[10px] font-medium text-[#047857] hover:bg-[#ECFDF5]"
                                >
                                  Encaisser
                                </button>
                              ) : null}
                            </td>
                          )}
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
