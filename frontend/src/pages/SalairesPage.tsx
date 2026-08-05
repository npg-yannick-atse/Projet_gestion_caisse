import { useEffect, useMemo, useState } from 'react';
import { Banknote, CheckCircle2, Search, Undo2 } from 'lucide-react';
import {
  useGrilleSalaires,
  usePayerSalaire,
  useAnnulerPaiementSalaire,
  type LigneSalaire,
  type SourceFonds,
} from '@/api/salaires';
import { useCaisses } from '@/api/caisses';
import { usePortefeuilles, useDevises } from '@/api/financierRef';
import { useDirections } from '@/api/directions';
import { useMyPermissions } from '@/api/users';
import { useAuthStore } from '@/stores/auth.store';
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

  const { data, isLoading, isError, error } = useGrilleSalaires({
    periode,
    search: debounced || undefined,
    directionId: directionId || undefined,
  });

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
  const [aAnnuler, setAAnnuler] = useState<LigneSalaire | null>(null);

  const lignes = data?.lignes ?? [];
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
        periode,
        sourceType,
        sourceId,
        deviseId: deviseSource,
      },
      { onSuccess: () => setAPayer(null) },
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

        {data && (
          <table className="w-full text-xs">
            <thead className="bg-[#F8FAFC]">
              <tr className="text-left text-[10px] uppercase tracking-[0.7px] text-[#64748B]">
                <th className="px-4 py-2.5 font-semibold">Matricule</th>
                <th className="px-4 py-2.5 font-semibold">Employé</th>
                <th className="px-4 py-2.5 text-right font-semibold">Salaire</th>
                <th className="px-4 py-2.5 font-semibold">Paiement du mois</th>
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
              <br />
              <br />
              L'argent sort réellement et l'écriture comptable est générée.
            </>
          }
          confirmLabel={payer.isPending ? 'Paiement…' : 'Payer'}
          onConfirm={confirmerPaiement}
          onCancel={() => setAPayer(null)}
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
export function SalairesPage() {
  return (
    <RoleGuard allow={['ADMINISTRATEUR', 'SUPER_ADMIN', 'DAF']} permission="EMPLOYE_VOIR_SALAIRE">
      <SalairesPageInner />
    </RoleGuard>
  );
}
