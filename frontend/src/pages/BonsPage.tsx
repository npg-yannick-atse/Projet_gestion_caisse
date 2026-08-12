import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useRouterState } from '@tanstack/react-router';
import { CalendarRange, CircleCheck, Clock, Eye, FileCheck2, Files, Search, X } from 'lucide-react';
import { useBons } from '@/api/bons';
import { useUserRoles, useMyPermissions } from '@/api/users';
import { useAuthStore } from '@/stores/auth.store';
import type { Bon, BonStatut } from '@/types/api';
import { formatMontant } from '@/lib/utils';
import { StatCard } from '@/components/ui/stat-card';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { StatutBadge } from '@/components/StatutBadge';
import { SortableHeader } from '@/components/SortableHeader';
import { useTableSort } from '@/hooks/useTableSort';

const BONS_SORT_COLUMNS = ['numero', 'statut', 'montantTotal', 'createdAt'] as const;
type BonSortCol = (typeof BONS_SORT_COLUMNS)[number];

/** Date du jour au format YYYY-MM-DD (heure locale). */
function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const FILTERS: { key: 'all' | BonStatut; label: string }[] = [
  { key: 'all', label: 'Tous' },
  { key: 'CREE', label: 'En attente' },
  { key: 'VALIDE', label: 'Validés' },
  { key: 'DECAISSE', label: 'Décaissés' },
  { key: 'COMPTABILISE', label: 'Comptabilisés' },
  { key: 'ANNULE', label: 'Annulés' },
  { key: 'REFUSE', label: 'Refusés' },
];

const actBtn =
  'inline-flex items-center gap-1 rounded-[7px] border border-[rgba(15,76,129,0.1)] bg-white px-2.5 py-1 text-[10px] font-medium text-[#0F172A] transition-colors hover:border-[rgba(26,109,181,0.2)] hover:bg-[#EFF6FF] hover:text-[#1A6DB5]';

function RowActions({
  bon,
  canValidate,
  canDecaisser,
}: {
  bon: Bon;
  canValidate: boolean;
  canDecaisser: boolean;
}) {
  return (
    <div className="flex justify-end gap-1.5">
      {bon.statut === 'CREE' && canValidate && (
        <Link
          to="/bons/$bonId"
          params={{ bonId: bon.id }}
          className="inline-flex items-center gap-1 rounded-[7px] border border-[#0F4C81] bg-[#0F4C81] px-2.5 py-1 text-[10px] font-medium text-white transition-colors hover:bg-[#1A6DB5]"
        >
          Valider
        </Link>
      )}
      {/* « Décaisser » n'avait AUCUNE garde : un demandeur le voyait sur tout
          bon validé. Le serveur refusait bien l'action — ce n'était pas un trou
          de sécurité — mais le bouton promettait ce qu'il ne pouvait pas tenir. */}
      {bon.statut === 'VALIDE' && canDecaisser && (
        <Link to="/bons/$bonId" params={{ bonId: bon.id }} className={actBtn}>
          Décaisser
        </Link>
      )}
      <Link to="/bons/$bonId" params={{ bonId: bon.id }} className={actBtn} aria-label="Voir">
        <Eye className="h-3 w-3" />
      </Link>
    </div>
  );
}

const VALID_STATUTS: BonStatut[] = ['CREE', 'VALIDE', 'DECAISSE', 'COMPTABILISE', 'ANNULE', 'REFUSE'];

export function BonsPage() {
  const navigate = useNavigate();
  const currentUser = useAuthStore((s) => s.user);
  const { data: myRoles } = useUserRoles(currentUser?.id ?? null);
  const { data: myPermissions } = useMyPermissions(currentUser?.id ?? null);

  /**
   * Mêmes règles que le serveur : `assertPermission` = bypass administrateur OU
   * permission détenue. S'aligner dessus évite les deux écarts constatés le
   * 12/08/2026 :
   *
   *  - « Décaisser » n'avait aucune garde : tout le monde le voyait, y compris
   *    un demandeur, alors que seul le CAISSIER détient BON_DECAISSER ;
   *  - « Valider » se basait sur le RÔLE `VALIDATEUR`, alors que le serveur
   *    exige la PERMISSION `BON_VALIDER`, que seul ADMINISTRATEUR détient. Un
   *    validateur voyait donc un bouton qui le menait à un refus.
   *
   * `useUserRoles` renvoie les rôles DÉPLIÉS : un DAF y apparaît comme
   * ADMINISTRATEUR, exactement comme le calcule `isAdmin` côté serveur.
   */
  const perms = new Set(myPermissions ?? []);
  const isAdmin = (myRoles ?? []).some((r) =>
    ['ADMINISTRATEUR', 'SUPER_ADMIN'].includes(r.code),
  );
  const canValider = isAdmin || perms.has('BON_VALIDER');
  const canDecaisser = isAdmin || perms.has('BON_DECAISSER');
  // On lit la querystring brute pour rester indépendant du schéma de validation TanStack.
  const _href = useRouterState({ select: (s) => s.location.href });

  // Validation simple ISO YYYY-MM-DD (le <input type="date"> renvoie déjà ce format)
  const isIsoDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

  const urlParams = useMemo(() => {
    const qs = typeof window !== 'undefined' ? window.location.search : '';
    const sp = new URLSearchParams(qs);
    const rawStatut = sp.get('statut');
    const rawPeriod = sp.get('period');
    const rawFrom = sp.get('dateFrom') ?? '';
    const rawTo = sp.get('dateTo') ?? '';
    return {
      statut:
        rawStatut && VALID_STATUTS.includes(rawStatut as BonStatut)
          ? (rawStatut as BonStatut)
          : null,
      period: rawPeriod === 'today' || rawPeriod === 'week' || rawPeriod === 'month' ? rawPeriod : null,
      extension: sp.get('extension') === '1',
      // Marqueur « tout afficher » : le défaut du jour étant implicite, il faut
      // un signe explicite pour dire qu'on l'a délibérément retiré.
      showAll: sp.get('range') === 'all',
      // Restriction à un demandeur, transmise par les tuiles du tableau de bord :
      // sans elle, « En attente 0 » menait à la liste de TOUT LE MONDE.
      demandeurId: /^\d+$/.test(sp.get('demandeurId') ?? '') ? (sp.get('demandeurId') as string) : '',
      dateFrom: isIsoDate(rawFrom) ? rawFrom : '',
      dateTo: isIsoDate(rawTo) ? rawTo : '',
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [_href]);

  const [search, setSearch] = useState('');

  /**
   * La journée courante par défaut, pour borner le volume — mais JAMAIS au
   * point de cacher du travail à faire. Deux garde-fous :
   *
   *  1. Choisir un ONGLET DE STATUT met les dates de côté. « Validés » est une
   *     file d'attente : un bon validé attend parfois plusieurs jours son
   *     décaissement, le restreindre à aujourd'hui le rendrait invisible.
   *  2. Les COMPTEURS ignorent les dates (voir plus bas) : on voit donc qu'il
   *     reste 10 bons à décaisser même si la journée est vide.
   *
   * Le défaut reste implicite (absent de l'URL), d'où le marqueur `range=all`
   * pour exprimer « je l'ai retiré volontairement ». Et le bandeau de filtre
   * actif s'affiche MÊME pour ce défaut implicite : c'est ce qui manquait,
   * l'utilisateur voyait quatre zéros sans rien pour comprendre ni en sortir.
   */
  const datesActives = urlParams.statut == null;
  const dateImplicite =
    datesActives && !urlParams.dateFrom && !urlParams.dateTo && !urlParams.showAll;
  const effFrom = urlParams.dateFrom || (dateImplicite ? todayLocal() : '');
  const effTo = urlParams.dateTo || (dateImplicite ? todayLocal() : '');

  // Brouillon local des inputs date (vide tant que l'utilisateur n'a rien saisi).
  const [draftFrom, setDraftFrom] = useState(effFrom);
  const [draftTo, setDraftTo] = useState(effTo);

  // Resynchronise les inputs quand l'URL change DE L'EXTÉRIEUR (drill-down
  // depuis un tableau de bord, réinitialisation), pas au premier rendu.
  const firstSync = useRef(true);
  useEffect(() => {
    if (firstSync.current) {
      firstSync.current = false;
      return;
    }
    setDraftFrom(urlParams.dateFrom);
    setDraftTo(urlParams.dateTo);
  }, [urlParams.dateFrom, urlParams.dateTo]);

  // Push les dates saisies dans l'URL après debounce (pour partage/permalien + bandeau).
  useEffect(() => {
    const id = setTimeout(() => {
      const sp = new URLSearchParams(window.location.search);
      if (draftFrom) sp.set('dateFrom', draftFrom);
      else sp.delete('dateFrom');
      if (draftTo) sp.set('dateTo', draftTo);
      else sp.delete('dateTo');
      const obj: Record<string, string> = {};
      sp.forEach((v, k) => {
        obj[k] = v;
      });
      navigate({ to: '/bons', search: obj as any, replace: true });
    }, 350);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftFrom, draftTo]);

  // Tri (URL-synced). Whitelist alignée avec le backend (BonsService.BON_SORT_MAP).
  const sort = useTableSort<BonSortCol>('/bons', BONS_SORT_COLUMNS);

  // Tous les filtres (URL + recherche locale + tri) → envoyés au backend
  const { data: bons, isLoading, isError } = useBons({
    statut: urlParams.statut ?? undefined,
    period: (urlParams.period as 'today' | 'week' | 'month' | null) ?? undefined,
    extension: urlParams.extension || undefined,
    search: search.trim() || undefined,
    demandeurId: urlParams.demandeurId || undefined,
    // Un onglet de statut est une file d'attente : les dates n'y sont pas
    // appliquées, sinon « Validés » ne montrerait que ceux du jour.
    dateFrom: datesActives ? effFrom || undefined : undefined,
    dateTo: datesActives ? effTo || undefined : undefined,
    sortBy: sort.state.by ?? undefined,
    sortDir: sort.state.by ? sort.state.dir : undefined,
  });

  /**
   * Compteurs « Total / En attente / Validés / Décaissés » : ni le statut, ni la
   * recherche, NI LES DATES.
   *
   * Ce sont eux qui disent ce qu'il reste à faire. Les faire suivre la journée
   * les mettait tous à zéro dès le lendemain, et l'écran annonçait qu'il n'y
   * avait rien à décaisser alors que dix bons attendaient.
   */
  const { data: bonsForCounters } = useBons({
    period: (urlParams.period as 'today' | 'week' | 'month' | null) ?? undefined,
    extension: urlParams.extension || undefined,
    // La restriction au demandeur EST reprise : sinon la tuile « En attente 0 »
    // du tableau de bord mènerait à des compteurs qui en annoncent d'autres.
    demandeurId: urlParams.demandeurId || undefined,
  });

  const filter: 'all' | BonStatut = urlParams.statut ?? 'all';
  const setFilter = (next: 'all' | BonStatut) => {
    const sp = new URLSearchParams(window.location.search);
    if (next === 'all') sp.delete('statut');
    else sp.set('statut', next);
    const obj: Record<string, string> = {};
    sp.forEach((v, k) => {
      obj[k] = v;
    });
    navigate({ to: '/bons', search: obj as any, replace: true });
  };

  const countBy = (s: BonStatut) =>
    (bonsForCounters ?? []).filter((b) => b.statut === s).length;

  const rows = bons ?? [];

  // Reset search au changement de filtre URL
  useEffect(() => {
    setSearch('');
  }, [urlParams.statut, urlParams.period, urlParams.extension]);

  // `dateImplicite` en fait partie : c'est tout l'intérêt du bandeau. Un filtre
  // appliqué sans être annoncé n'offre aucun moyen d'en sortir.
  const hasActiveDrill =
    urlParams.statut != null ||
    urlParams.period === 'today' ||
    urlParams.extension ||
    !!urlParams.demandeurId ||
    !!urlParams.dateFrom ||
    !!urlParams.dateTo ||
    dateImplicite;

  const formatDateFR = (iso: string) => {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard tone="gray" icon={Files} label="Total" value={bonsForCounters?.length ?? 0} sub="Tous bons" />
        <StatCard tone="amber" icon={Clock} label="En attente" value={countBy('CREE')} sub="À valider" />
        <StatCard tone="blue" icon={FileCheck2} label="Validés" value={countBy('VALIDE')} sub="À décaisser" />
        <StatCard tone="green" icon={CircleCheck} label="Décaissés" value={countBy('DECAISSE')} sub="Terminés" />
      </div>

      {hasActiveDrill && (
        <div className="flex flex-wrap items-center gap-2 rounded-[10px] border border-[#BFDBFE] bg-[#EFF6FF] px-3 py-2 text-xs text-[#1A6DB5]">
          <span className="font-medium">Filtre actif :</span>
          {urlParams.statut && (
            <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold">
              statut = {urlParams.statut}
            </span>
          )}
          {urlParams.period === 'today' && (
            <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold">
              aujourd'hui
            </span>
          )}
          {urlParams.extension && (
            <span className="rounded-full bg-[#FEF3F2] px-2 py-0.5 text-[10px] font-semibold text-[#B42318]">
              avec demande d'extension
            </span>
          )}
          {urlParams.demandeurId && (
            <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold">
              mes bons uniquement
            </span>
          )}
          {dateImplicite && (
            <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold">
              <CalendarRange className="h-3 w-3" />
              aujourd'hui
            </span>
          )}
          {!datesActives && (
            <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-[#64748B]">
              dates non appliquées à un statut
            </span>
          )}
          {(urlParams.dateFrom || urlParams.dateTo) && (
            <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold">
              <CalendarRange className="h-3 w-3" />
              {urlParams.dateFrom && urlParams.dateTo
                ? `${formatDateFR(urlParams.dateFrom)} → ${formatDateFR(urlParams.dateTo)}`
                : urlParams.dateFrom
                  ? `depuis ${formatDateFR(urlParams.dateFrom)}`
                  : `jusqu'au ${formatDateFR(urlParams.dateTo)}`}
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              // Réinitialiser : on retire tous les filtres de l'URL.
              // `range=all` et non une URL vide : sans ce marqueur, le défaut
              // implicite « aujourd'hui » reviendrait aussitôt.
              setDraftFrom('');
              setDraftTo('');
              navigate({ to: '/bons', search: { range: 'all' } as any, replace: true });
            }}
            className="ml-auto rounded-[7px] border border-[#BFDBFE] bg-white px-2.5 py-1 text-[10px] font-medium text-[#1A6DB5] hover:bg-[#DBEAFE]"
          >
            Réinitialiser
          </button>
        </div>
      )}

      <Panel>
        <PanelHeader title="Tous les bons" badge={`${rows.length}`}>
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={
                  filter === f.key
                    ? 'rounded-[7px] border border-[#0F4C81] bg-[#0F4C81] px-2.5 py-1 text-[10px] font-medium text-white'
                    : 'rounded-[7px] border border-[rgba(15,76,129,0.1)] bg-white px-2.5 py-1 text-[10px] font-medium text-[#475569] hover:bg-[#F8FAFC]'
                }
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {/* Période — filtre BD */}
            <div className="flex items-center gap-1 rounded-[9px] border border-[rgba(15,76,129,0.1)] bg-[#F8FAFC] px-2 py-1">
              <CalendarRange className="h-3.5 w-3.5 text-[#64748B]" />
              <input
                type="date"
                value={draftFrom}
                onChange={(e) => setDraftFrom(e.target.value)}
                aria-label="Date de début"
                title="À partir du…"
                className="bg-transparent text-[11px] text-[#0F172A] outline-none placeholder:text-[#94A3B8]"
              />
              <span className="text-[10px] text-[#64748B]">au</span>
              <input
                type="date"
                value={draftTo}
                onChange={(e) => setDraftTo(e.target.value)}
                aria-label="Date de fin"
                title="Jusqu'au…"
                min={draftFrom || undefined}
                className="bg-transparent text-[11px] text-[#0F172A] outline-none placeholder:text-[#94A3B8]"
              />
              {(draftFrom || draftTo) && (
                <button
                  type="button"
                  onClick={() => {
                    // Effacer les dates = tout afficher (on conserve les autres filtres),
                    // sans relancer le défaut « aujourd'hui ».
                    setDraftFrom('');
                    setDraftTo('');
                    const sp = new URLSearchParams(window.location.search);
                    sp.delete('dateFrom');
                    sp.delete('dateTo');
                    sp.set('range', 'all');
                    const obj: Record<string, string> = {};
                    sp.forEach((v, k) => {
                      obj[k] = v;
                    });
                    navigate({ to: '/bons', search: obj as any, replace: true });
                  }}
                  aria-label="Effacer les dates"
                  title="Effacer les dates"
                  className="ml-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#E2E8F0] text-[#475569] hover:bg-[#CBD5E1]"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              )}
            </div>

            {/* Recherche numéro — filtre BD (LIKE) */}
            <div className="flex items-center gap-2 rounded-[9px] border border-[rgba(15,76,129,0.1)] bg-[#F8FAFC] px-2.5 py-1.5">
              <Search className="h-3.5 w-3.5 text-[#64748B]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher…"
                className="w-28 bg-transparent text-[11px] text-[#0F172A] outline-none placeholder:text-[#94A3B8] sm:w-40"
              />
            </div>
          </div>
        </PanelHeader>

        {isLoading && <div className="px-[18px] py-8 text-sm text-[#64748B]">Chargement…</div>}
        {isError && <div className="px-[18px] py-8 text-sm text-[#EF4444]">Impossible de charger les bons.</div>}

        {bons && (
          <table className="w-full text-xs">
            <thead className="bg-[#F8FAFC]">
              <tr className="text-left text-[10px] uppercase tracking-[0.7px] text-[#64748B]">
                <SortableHeader column="numero" state={sort.state} onSort={sort.setSort}>
                  Numéro
                </SortableHeader>
                <SortableHeader column="statut" state={sort.state} onSort={sort.setSort}>
                  Statut
                </SortableHeader>
                <SortableHeader
                  column="montantTotal"
                  state={sort.state}
                  onSort={sort.setSort}
                  align="right"
                  defaultDir="desc"
                >
                  Montant
                </SortableHeader>
                <SortableHeader
                  column="createdAt"
                  state={sort.state}
                  onSort={sort.setSort}
                  defaultDir="desc"
                >
                  Créé le
                </SortableHeader>
                <th className="px-4 py-2.5 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-[#64748B]">
                    <div className="mb-2 text-2xl opacity-25">📋</div>
                    Aucun bon trouvé
                  </td>
                </tr>
              )}
              {rows.map((bon) => (
                <tr key={bon.id} className="border-t border-[rgba(15,76,129,0.07)] hover:bg-[#FAFBFF]">
                  <td className="px-4 py-3 font-medium">
                    <Link to="/bons/$bonId" params={{ bonId: bon.id }} className="text-[#1A6DB5] hover:underline">
                      {bon.numero}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <StatutBadge statut={bon.statut} />
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">
                    {(() => {
                      // Bon entièrement traité + montant effectif différent du demandé
                      // => on affiche le montant réellement décaissé (ajusté), l'original barré.
                      const traite = bon.statut === 'DECAISSE' || bon.statut === 'COMPTABILISE';
                      const eff = bon.montantDecaisse;
                      const ajuste =
                        traite && eff != null && String(eff) !== String(bon.montantTotal);
                      if (ajuste) {
                        return (
                          <span title="Montant ajusté au décaissement">
                            <span className="block text-[#0F172A]">{formatMontant(eff!)}</span>
                            <span className="block text-[10px] font-normal text-[#94A3B8] line-through">
                              {formatMontant(bon.montantTotal)}
                            </span>
                          </span>
                        );
                      }
                      return formatMontant(bon.montantTotal);
                    })()}
                  </td>
                  <td className="px-4 py-3 text-[#64748B]">{new Date(bon.createdAt).toLocaleDateString('fr-FR')}</td>
                  <td className="px-4 py-3">
                    <RowActions bon={bon} canValidate={canValider} canDecaisser={canDecaisser} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}
