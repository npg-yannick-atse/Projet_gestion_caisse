import { useEffect, useMemo, useState } from 'react';
import { Banknote, CheckCircle2, Search, Undo2 } from 'lucide-react';
import {
  useGrilleSalaires,
  useArrieresSalaires,
  usePayerSalaire,
  useAnnulerPaiementSalaire,
  type LigneSalaire,
  type SourceFonds,
  type StatutSalaire,
} from '@/api/salaires';
import { useCaisses } from '@/api/caisses';
import { usePortefeuilles, useDevises } from '@/api/financierRef';
import { useDirections } from '@/api/directions';
import { useMyPermissions } from '@/api/users';
import { useAuthStore } from '@/stores/auth.store';
import { SortableHeader } from '@/components/SortableHeader';
import { useTableSort } from '@/hooks/useTableSort';
import { useClientSort } from '@/hooks/useClientSort';
import { apiErrorMessage, cn, formatMontant } from '@/lib/utils';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { RoleGuard } from '@/components/RoleGuard';
import { ConfirmDialog } from '@/components/ConfirmDialog';

const inputClass =
  'h-9 rounded-[9px] border border-[rgba(15,76,129,0.12)] bg-white px-3 text-xs text-[#0F172A] outline-none focus:border-[#1A6DB5]';

/** Mois courant au format AAAA-MM (identique à la règle serveur). */
function periodeCourante(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** « 2026-07 » → « juillet 2026 ». */
function libellePeriode(p: string): string {
  const [a, m] = p.split('-').map(Number);
  if (!a || !m) return p;
  return new Date(a, m - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}

function SalairesPageInner() {
  const currentUser = useAuthStore((s) => s.user);
  const { data: myPerms } = useMyPermissions(currentUser?.id ?? null);
  const peutPayer = (myPerms ?? []).includes('SALAIRE_PAYER');

  const [periode, setPeriode] = useState(periodeCourante());
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);
  const [directionId, setDirectionId] = useState('');
  // '' = tous. NON_PAYE isole les employés absents le jour de la paie, qu'il
  // faudra régler à leur retour — c'est la liste qu'on vient consulter.
  // '' = tous · PAYE · NON_PAYE portent sur le mois affiché ;
  // ARRIERES bascule sur les mois ANTÉRIEURS restés impayés.
  const [statut, setStatut] = useState<'' | StatutSalaire | 'ARRIERES'>('');
  const vueArrieres = statut === 'ARRIERES';
  // Période réellement réglée : celle de la ligne pour un arriéré, sinon le mois
  // affiché. Sans ça, payer un arriéré l'aurait imputé au mois courant.
  const [periodeAPayer, setPeriodeAPayer] = useState('');

  const { data, isLoading, isError, error } = useGrilleSalaires({
    periode,
    search: debounced || undefined,
    directionId: directionId || undefined,
    statut: vueArrieres ? undefined : statut || undefined,
  });

  const { data: arrieres } = useArrieresSalaires(
    { periode, search: debounced || undefined, directionId: directionId || undefined },
    vueArrieres,
  );

  const { data: caisses } = useCaisses();
  const { data: portefeuilles } = usePortefeuilles();
  const { data: devises } = useDevises();
  const { data: directions } = useDirections();

  const payer = usePayerSalaire();
  const annuler = useAnnulerPaiementSalaire();

  // Source des fonds, commune à tous les paiements de l'écran.
  const [sourceType, setSourceType] = useState<SourceFonds>('CAISSE');
  const [sourceId, setSourceId] = useState('');
  const caissesOuvertes = useMemo(
    () => (caisses ?? []).filter((c) => c.statut === 'OUVERTE'),
    [caisses],
  );
  const source = useMemo(() => {
    if (sourceType === 'CAISSE') return caissesOuvertes.find((c) => String(c.id) === sourceId);
    return (portefeuilles ?? []).find((p) => String(p.id) === sourceId);
  }, [sourceType, sourceId, caissesOuvertes, portefeuilles]);
  const deviseSource = source ? String((source as any).deviseId) : '';
  const deviseCode = (devises ?? []).find((d) => String(d.id) === deviseSource)?.code ?? '';

  const [aPayer, setAPayer] = useState<LigneSalaire | null>(null);
  // Montant que le caissier accepte de prélever quand le salaire est insuffisant.
  const [retenuePartielle, setRetenuePartielle] = useState('');
  const [aAnnuler, setAAnnuler] = useState<LigneSalaire | null>(null);

  // Tri à l'écran : la grille des salaires renvoie TOUS les employés de la
  // période en une fois, il n'y a donc aucune portion cachée à trier en base.
  const sort = useTableSort<SalaireSortCol>('/salaires', SALAIRE_SORT_COLUMNS);
  const lignes = useClientSort(data?.lignes, sort.state, {
    matricule: (l) => l.matricule,
    nom: (l) => `${l.nom} ${l.prenoms ?? ''}`.trim(),
    // Un salaire non renseigné n'est pas « zéro » : `null` le renvoie en fin de
    // liste plutôt que de le classer avant le plus petit salaire réel.
    salaire: (l) => (l.salaire ? Number(l.salaire) : null),
    paiement: (l) => (l.paiement ? new Date(l.paiement.datePaiement) : null),
  });
  const totaux = useMemo(() => {
    let du = 0;
    let paye = 0;
    let sansSalaire = 0;
    for (const l of lignes) {
      const s = Number(l.salaire ?? 0);
      if (!l.salaire || s <= 0) sansSalaire += 1;
      else du += s;
      if (l.paiement) paye += Number(l.paiement.montant);
    }
    return { du, paye, reste: du - paye, sansSalaire, nb: lignes.length };
  }, [lignes]);

  const confirmerPaiement = () => {
    if (!aPayer || !sourceId) return;
    payer.mutate(
      {
        employeId: aPayer.employeId,
        periode: periodeAPayer || periode,
        sourceType,
        sourceId,
        deviseId: deviseSource,
        // Transmis uniquement dans le cas « salaire insuffisant » : sinon
        // l'échéance est prélevée en entier et cette valeur est ignorée.
        montantRetenue:
          aPayer.retenueCredit?.salaireInsuffisant && Number(retenuePartielle) > 0
            ? retenuePartielle
            : undefined,
      },
      { onSuccess: () => { setAPayer(null); setRetenuePartielle(''); setPeriodeAPayer(''); } },
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <Panel>
        <PanelHeader title={`Salaires — ${libellePeriode(periode)}`} badge={`${totaux.nb}`}>
          {!peutPayer && (
            <span className="ml-auto text-[11px] text-[#94A3B8]">
              Consultation seule — permission « Payer un salaire » requise
            </span>
          )}
        </PanelHeader>

        {/* Onglets d'état : le compteur porte sur toute la période, pas sur la
            liste filtrée, sinon l'onglet actif afficherait toujours le total. */}
        <div className="flex gap-1 border-b border-[rgba(15,76,129,0.07)] px-[18px] pt-2.5">
          {([
            { v: '' as const, label: 'Tous', n: data?.stats.total },
            { v: 'NON_PAYE' as const, label: 'Non payés', n: data?.stats.nonPayes },
            { v: 'PAYE' as const, label: 'Payés', n: data?.stats.payes },
            { v: 'ARRIERES' as const, label: 'Mois antérieurs', n: arrieres?.stats.nb },
          ]).map((o) => (
            <button
              key={o.v || 'tous'}
              type="button"
              onClick={() => setStatut(o.v)}
              className={cn(
                'rounded-t-[9px] px-3.5 py-2 text-[11px] font-medium transition-colors',
                statut === o.v
                  ? 'bg-[#EFF6FF] text-[#0F4C81]'
                  : 'text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#0F172A]',
              )}
            >
              {o.label}
              {o.n !== undefined && (
                <span className="ml-1.5 rounded-full bg-white px-1.5 py-0.5 text-[10px] font-semibold text-[#1A6DB5]">
                  {o.n}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Filtres + source des fonds */}
        <div className="flex flex-wrap items-end gap-3 border-b border-[rgba(15,76,129,0.07)] px-[18px] py-3">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold uppercase tracking-[0.6px] text-[#64748B]" htmlFor="sal-periode">
              Mois
            </label>
            <input
              id="sal-periode"
              type="month"
              value={periode}
              max={periodeCourante()}
              onChange={(e) => setPeriode(e.target.value)}
              className={inputClass}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold uppercase tracking-[0.6px] text-[#64748B]" htmlFor="sal-dir">
              Direction
            </label>
            <select id="sal-dir" value={directionId} onChange={(e) => setDirectionId(e.target.value)} className={inputClass}>
              <option value="">Toutes</option>
              {directions?.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.libelle}
                </option>
              ))}
            </select>
          </div>

          {peutPayer && (
            <>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold uppercase tracking-[0.6px] text-[#64748B]" htmlFor="sal-src-type">
                  Payer depuis
                </label>
                <select
                  id="sal-src-type"
                  value={sourceType}
                  onChange={(e) => {
                    setSourceType(e.target.value as SourceFonds);
                    setSourceId('');
                  }}
                  className={inputClass}
                >
                  <option value="CAISSE">Caisse</option>
                  <option value="PORTEFEUILLE">Portefeuille</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold uppercase tracking-[0.6px] text-[#64748B]" htmlFor="sal-src">
                  {sourceType === 'CAISSE' ? 'Caisse (ouverte)' : 'Portefeuille'}
                </label>
                <select id="sal-src" value={sourceId} onChange={(e) => setSourceId(e.target.value)} className={cn(inputClass, 'min-w-[200px]')}>
                  <option value="">— Choisir —</option>
                  {sourceType === 'CAISSE'
                    ? caissesOuvertes.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.code} — {c.libelle}
                        </option>
                      ))
                    : (portefeuilles ?? [])
                        .filter((p) => p.estActif !== false)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.code} — {p.libelle}
                          </option>
                        ))}
                </select>
              </div>
            </>
          )}

          <div className="relative ml-auto min-w-[200px] flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#94A3B8]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher (matricule, nom)…"
              className={cn(inputClass, 'w-full pl-8')}
            />
          </div>
        </div>

        {/* Totaux */}
        <div className="flex flex-wrap gap-4 border-b border-[rgba(15,76,129,0.07)] bg-[#F8FAFC] px-[18px] py-2.5 text-[11px]">
          <span className="text-[#64748B]">
            Masse salariale : <strong className="text-[#0F172A]">{formatMontant(String(totaux.du))}</strong>
          </span>
          <span className="text-[#047857]">
            Déjà payé : <strong>{formatMontant(String(totaux.paye))}</strong>
          </span>
          <span className={totaux.reste > 0 ? 'text-[#B54708]' : 'text-[#64748B]'}>
            Reste à payer : <strong>{formatMontant(String(totaux.reste))}</strong>
          </span>
          {totaux.sansSalaire > 0 && (
            <span className="text-[#94A3B8]">
              {totaux.sansSalaire} employé{totaux.sansSalaire > 1 ? 's' : ''} sans salaire renseigné
            </span>
          )}
        </div>

        {isLoading && <div className="px-[18px] py-8 text-sm text-[#64748B]">Chargement…</div>}
        {isError && (
          <div className="px-[18px] py-8 text-sm text-[#EF4444]">
            {apiErrorMessage(error, 'Impossible de charger les salaires.')}
          </div>
        )}

        {/* Mois antérieurs : un tableau à part, car une ligne y désigne un COUPLE
            employé + mois, alors que la grille normale n'a qu'une ligne par
            employé. Payer ici impute au mois de la ligne, pas au mois affiché. */}
        {vueArrieres && arrieres && (
          <table className="w-full text-xs">
            <thead className="bg-[#F8FAFC]">
              <tr className="text-left text-[10px] uppercase tracking-[0.7px] text-[#64748B]">
                <th className="px-4 py-2.5 font-semibold">Mois dû</th>
                <th className="px-4 py-2.5 font-semibold">Matricule</th>
                <th className="px-4 py-2.5 font-semibold">Employé</th>
                <th className="px-4 py-2.5 text-right font-semibold">Salaire</th>
                <th className="px-4 py-2.5"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {arrieres.lignes.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-[#64748B]">
                    Aucun salaire en retard sur les mois précédents.
                  </td>
                </tr>
              )}
              {arrieres.lignes.map((l) => {
                const sansSalaire = !l.salaire || Number(l.salaire) <= 0;
                return (
                  <tr key={`${l.employeId}-${l.periode}`} className="border-t border-[rgba(15,76,129,0.07)] hover:bg-[#FAFBFF]">
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-[#FFFBEB] px-2 py-0.5 text-[10px] font-semibold text-[#78350F]">
                        {libellePeriode(l.periode)}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-[#1A6DB5]">{l.matricule}</td>
                    <td className="px-4 py-3 font-medium text-[#0F172A]">
                      {l.nom} {l.prenoms ?? ''}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {sansSalaire ? (
                        <span className="text-[10px] uppercase tracking-[0.5px] text-[#94A3B8]">non renseigné</span>
                      ) : (
                        formatMontant(l.salaire as string)
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {peutPayer && (
                        <button
                          type="button"
                          disabled={sansSalaire || !sourceId}
                          title={
                            sansSalaire
                              ? 'Renseignez le salaire de cet employé'
                              : !sourceId
                                ? 'Choisissez la caisse ou le portefeuille source'
                                : undefined
                          }
                          onClick={() => {
                            setPeriodeAPayer(l.periode);
                            setAPayer({ ...l, paiement: null, retenueCredit: null } as LigneSalaire);
                          }}
                          className="inline-flex items-center gap-1.5 rounded-[7px] bg-[#0F4C81] px-2.5 py-1 text-[11px] font-medium text-white hover:bg-[#1A6DB5] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Banknote className="h-3.5 w-3.5" /> Payer
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {!vueArrieres && data && (
          <table className="w-full text-xs">
            <thead className="bg-[#F8FAFC]">
              <tr className="text-left text-[10px] uppercase tracking-[0.7px] text-[#64748B]">
                <SortableHeader column="matricule" state={sort.state} onSort={sort.setSort}>Matricule</SortableHeader>
                <SortableHeader column="nom" state={sort.state} onSort={sort.setSort}>Employé</SortableHeader>
                <SortableHeader column="salaire" state={sort.state} onSort={sort.setSort} align="right">Salaire</SortableHeader>
                <SortableHeader column="paiement" state={sort.state} onSort={sort.setSort}>Paiement du mois</SortableHeader>
                <th className="px-4 py-2.5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {lignes.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-[#64748B]">
                    Aucun employé.
                  </td>
                </tr>
              )}
              {lignes.map((l) => {
                const sansSalaire = !l.salaire || Number(l.salaire) <= 0;
                return (
                  <tr key={l.employeId} className="border-t border-[rgba(15,76,129,0.07)] hover:bg-[#FAFBFF]">
                    <td className="px-4 py-3 font-mono text-[#1A6DB5]">{l.matricule}</td>
                    <td className="px-4 py-3 font-medium text-[#0F172A]">
                      {l.nom} {l.prenoms ?? ''}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {sansSalaire ? (
                        <span className="text-[10px] uppercase tracking-[0.5px] text-[#94A3B8]">non renseigné</span>
                      ) : (
                        formatMontant(l.salaire as string)
                      )}
                      {/* Retenue annoncée dès la liste : le caissier repère
                          d'un coup d'œil les paies qui ne sortiront pas en entier. */}
                      {l.retenueCredit && !l.paiement && (
                        <div
                          className={`mt-0.5 text-[10px] font-medium ${
                            l.retenueCredit.salaireInsuffisant ? 'text-[#B42318]' : 'text-[#B45309]'
                          }`}
                          title={
                            l.retenueCredit.salaireInsuffisant
                              ? 'Salaire insuffisant : aucune retenue ne sera faite'
                              : `Échéance ${l.retenueCredit.echeance}/${l.retenueCredit.nbMois} du crédit`
                          }
                        >
                          {l.retenueCredit.salaireInsuffisant
                            ? 'crédit non retenu'
                            : `− ${formatMontant(l.retenueCredit.montant)} crédit`}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {l.paiement ? (
                        <span className="inline-flex items-center gap-1.5 text-[#047857]">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {formatMontant(l.paiement.montant)} le{' '}
                          {new Date(l.paiement.datePaiement).toLocaleDateString('fr-FR')}
                        </span>
                      ) : (
                        <span className="text-[#94A3B8]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {peutPayer && !l.paiement && (
                        <button
                          type="button"
                          disabled={sansSalaire || !sourceId}
                          title={
                            sansSalaire
                              ? 'Renseignez le salaire de cet employé'
                              : !sourceId
                                ? 'Choisissez la caisse ou le portefeuille source'
                                : undefined
                          }
                          onClick={() => setAPayer(l)}
                          className="inline-flex items-center gap-1.5 rounded-[7px] bg-[#0F4C81] px-2.5 py-1 text-[11px] font-medium text-white hover:bg-[#1A6DB5] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Banknote className="h-3.5 w-3.5" /> Payer
                        </button>
                      )}
                      {peutPayer && l.paiement && (
                        <button
                          type="button"
                          onClick={() => setAAnnuler(l)}
                          className="inline-flex items-center gap-1.5 rounded-[7px] border border-[rgba(180,35,24,0.25)] px-2.5 py-1 text-[11px] font-medium text-[#B42318] hover:bg-[#FEF3F2]"
                        >
                          <Undo2 className="h-3.5 w-3.5" /> Annuler
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {(payer.isError || annuler.isError) && (
          <div className="border-t border-[rgba(15,76,129,0.07)] px-[18px] py-3 text-xs text-[#B42318]">
            {apiErrorMessage(payer.error ?? annuler.error, 'Opération impossible')}
          </div>
        )}
      </Panel>

      {aPayer && (
        <ConfirmDialog
          open
          title="Payer ce salaire ?"
          description={
            <>
              <strong>
                {aPayer.nom} {aPayer.prenoms ?? ''}
              </strong>{' '}
              — {formatMontant(aPayer.salaire ?? '0')} {deviseCode}
              <br />
              Période : {libellePeriode(periode)}
              <br />
              Source : {sourceType === 'CAISSE' ? 'caisse' : 'portefeuille'}{' '}
              {(source as { code?: string } | undefined)?.code ?? ''}
              {/* Ce que le caissier remettra réellement en espèces. Sans ce
                  décompte il annoncerait le salaire entier, alors qu'une
                  mensualité de crédit va être retenue. */}
              {aPayer.retenueCredit && !aPayer.retenueCredit.salaireInsuffisant && (
                <div className="mt-3 space-y-1 rounded-[9px] border border-[rgba(15,76,129,0.12)] bg-[#F8FAFC] px-3 py-2 text-[12px]">
                  <div className="flex justify-between">
                    <span className="text-[#64748B]">Salaire</span>
                    <span className="tabular-nums">{formatMontant(aPayer.salaire ?? '0')}</span>
                  </div>
                  <div className="flex justify-between text-[#B45309]">
                    <span>
                      Retenue crédit · échéance {aPayer.retenueCredit.echeance}/{aPayer.retenueCredit.nbMois}
                    </span>
                    <span className="tabular-nums">−{formatMontant(aPayer.retenueCredit.montant)}</span>
                  </div>
                  <div className="flex justify-between border-t border-[rgba(15,76,129,0.1)] pt-1 font-semibold text-[#0F172A]">
                    <span>À remettre en espèces</span>
                    <span className="tabular-nums">
                      {formatMontant(Number(aPayer.salaire ?? 0) - Number(aPayer.retenueCredit.montant))}{' '}
                      {deviseCode}
                    </span>
                  </div>
                </div>
              )}
              {/* Salaire insuffisant : le caissier décide de ce qui peut être
                  prélevé. Le reliquat est reporté sur les mois suivants, sans
                  allonger la durée du crédit. */}
              {aPayer.retenueCredit?.salaireInsuffisant && (
                <div className="mt-3 space-y-2 rounded-[9px] border border-[#FECDCA] bg-[#FEF3F2] px-3 py-2.5 text-[12px] text-[#B42318]">
                  <p>
                    Le salaire ({formatMontant(aPayer.salaire ?? '0')}) ne couvre pas l'échéance{' '}
                    {aPayer.retenueCredit.echeance} de{' '}
                    <strong>{formatMontant(aPayer.retenueCredit.montant)}</strong>.
                  </p>
                  <label className="block">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.5px]">
                      Montant à prélever ce mois-ci
                    </span>
                    <input
                      inputMode="decimal"
                      value={retenuePartielle}
                      onChange={(e) => setRetenuePartielle(e.target.value.replace(/[^\d.]/g, ''))}
                      placeholder={`0 — au maximum ${formatMontant(aPayer.retenueCredit.maxPrelevable)}`}
                      className="mt-1 h-9 w-full rounded-[7px] border border-[#FECDCA] bg-white px-2.5 text-sm text-[#0F172A] outline-none focus:border-[#B42318]"
                    />
                  </label>
                  {Number(retenuePartielle) > 0 && (
                    <p className="text-[11px]">
                      Reliquat de{' '}
                      <strong>
                        {formatMontant(Number(aPayer.retenueCredit.montant) - Number(retenuePartielle))}
                      </strong>{' '}
                      reporté sur les mois suivants — la durée du crédit ne change pas.
                      <br />À remettre en espèces :{' '}
                      <strong>
                        {formatMontant(Number(aPayer.salaire ?? 0) - Number(retenuePartielle))} {deviseCode}
                      </strong>
                    </p>
                  )}
                  {!(Number(retenuePartielle) > 0) && (
                    <p className="text-[11px]">
                      Laissé vide : aucune retenue, le salaire part en entier et l'échéance passera
                      « en retard ».
                    </p>
                  )}
                </div>
              )}
              <br />
              <br />
              L'argent sort réellement et l'écriture comptable est générée.
            </>
          }
          confirmLabel={payer.isPending ? 'Paiement…' : 'Payer'}
          onConfirm={confirmerPaiement}
          onCancel={() => { setAPayer(null); setRetenuePartielle(''); setPeriodeAPayer(''); }}
        />
      )}

      {aAnnuler && (
        <ConfirmDialog
          open
          title="Annuler ce paiement ?"
          description={
            <>
              <strong>
                {aAnnuler.nom} {aAnnuler.prenoms ?? ''}
              </strong>{' '}
              — {formatMontant(aAnnuler.paiement?.montant ?? '0')}
              <br />
              <br />
              Une écriture inverse sera générée : l'écriture d'origine reste intacte.
            </>
          }
          confirmLabel={annuler.isPending ? 'Annulation…' : 'Annuler le paiement'}
          onConfirm={() =>
            aAnnuler.paiement &&
            annuler.mutate({ id: aAnnuler.paiement.id }, { onSuccess: () => setAAnnuler(null) })
          }
          onCancel={() => setAAnnuler(null)}
        />
      )}
    </div>
  );
}

/**
 * Écran Salaires : consultation de la grille et versement depuis une caisse.
 * Voir les montants exige EMPLOYE_VOIR_SALAIRE ; payer exige SALAIRE_PAYER.
 */
const SALAIRE_SORT_COLUMNS = ['matricule', 'nom', 'salaire', 'paiement'] as const;
type SalaireSortCol = (typeof SALAIRE_SORT_COLUMNS)[number];

export function SalairesPage() {
  return (
    <RoleGuard allow={['ADMINISTRATEUR', 'SUPER_ADMIN', 'DAF']} permission="EMPLOYE_VOIR_SALAIRE">
      <SalairesPageInner />
    </RoleGuard>
  );
}
