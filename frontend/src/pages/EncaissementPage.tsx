import { useMemo, useState } from 'react';
import { ArrowRight, Calendar, Landmark, TrendingUp, User } from 'lucide-react';
import { useDevises } from '@/api/financierRef';
import { useOperations } from '@/api/ledger';
import { useMyBonPerimeter } from '@/api/bons';
import { useEncaissement } from '@/api/encaissement';
import { apiErrorMessage, formatMontant } from '@/lib/utils';
import { StatCard } from '@/components/ui/stat-card';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { ClientSelect } from '@/components/ClientSelect';
import { SortableHeader } from '@/components/SortableHeader';
import { useTableSort } from '@/hooks/useTableSort';
import { useClientSort } from '@/hooks/useClientSort';

const selectClass =
  'h-10 w-full rounded-[9px] border border-[rgba(15,76,129,0.1)] bg-white px-3 text-sm text-[#0F172A] outline-none transition focus:border-[#1A6DB5] disabled:opacity-50';
const inputClass =
  'h-10 w-full rounded-[9px] border border-[rgba(15,76,129,0.1)] bg-white px-3 text-sm text-[#0F172A] outline-none transition focus:border-[#1A6DB5]';
const labelClass = 'text-[11px] font-semibold uppercase tracking-[0.6px] text-[#64748B]';

const ENC_SORT_COLUMNS = ['date', 'montant', 'client', 'motif'] as const;
type EncSortCol = (typeof ENC_SORT_COLUMNS)[number];
/** Le tableau n'affiche qu'un extrait : au-delà, la page deviendrait illisible. */
const ENC_MAX_LIGNES = 20;

export function EncaissementPage() {
  // Caisses limitées au périmètre de l'utilisateur (accès ECRITURE/ADMIN).
  const { data: perimeter } = useMyBonPerimeter();
  const caisses = perimeter?.caisses;
  const { data: encOps } = useOperations('ENCAISSEMENT');
  const { data: devises } = useDevises();
  const encaissement = useEncaissement();

  // Le tri porte sur TOUS les encaissements, puis on coupe : trier après la
  // coupe ne trierait que les 20 plus récents, ce qui ferait passer un extrait
  // pour un classement complet.
  const sort = useTableSort<EncSortCol>('/encaissement', ENC_SORT_COLUMNS);
  const encTries = useClientSort(encOps, sort.state, {
    date: (o) => new Date(o.dateOperation),
    montant: (o) => Number(o.montant),
    client: (o) => o.clientNom || o.clientNumero || null,
    motif: (o) => o.motif || null,
  });
  const encVisibles = encTries.slice(0, ENC_MAX_LIGNES);

  const [caisseId, setCaisseId] = useState('');
  const [montant, setMontant] = useState('');
  const [clientNom, setClientNom] = useState('');
  const [clientNumero, setClientNumero] = useState('');
  const [motif, setMotif] = useState('');
  const [done, setDone] = useState(false);

  const openCaisses = (caisses ?? []).filter((c) => c.statut === 'OUVERTE');
  const valid = !!caisseId && Number(montant) > 0;

  const codeOf = (deviseId?: string | null) => (devises ?? []).find((d) => d.id === deviseId)?.code ?? '';

  const stats = useMemo(() => {
    const ops = encOps ?? [];
    const byDevise = new Map<string, number>();
    for (const o of ops) {
      const k = String(o.deviseId);
      byDevise.set(k, (byDevise.get(k) ?? 0) + Number(o.montant || 0));
    }
    const totals = [...byDevise.entries()]
      .map(([deviseId, total]) => ({ deviseId, total }))
      .sort((a, b) => b.total - a.total);
    return { totals, last: ops[0], count: ops.length };
  }, [encOps]);

  const resetForm = () => {
    setMontant('');
    setClientNom('');
    setClientNumero('');
    setMotif('');
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setDone(false);
    encaissement.mutate(
      {
        caisseId,
        montant,
        clientNom: clientNom.trim() || undefined,
        clientNumero: clientNumero.trim() || undefined,
        motif: motif.trim() || undefined,
      },
      {
        onSuccess: () => {
          setDone(true);
          resetForm();
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          tone="green"
          icon={TrendingUp}
          label="Total encaissé"
          value={
            stats.totals.length === 0 ? (
              '—'
            ) : (
              <div className="flex flex-col gap-0.5">
                {stats.totals.map((t) => (
                  <div key={t.deviseId} className="leading-tight">
                    {formatMontant(t.total)}{' '}
                    <span className="text-[14px] font-semibold text-[#64748B]">{codeOf(t.deviseId)}</span>
                  </div>
                ))}
              </div>
            )
          }
          sub="Cumulé par devise"
        />
        <StatCard
          tone="blue"
          icon={Calendar}
          label="Dernier encaissement"
          value={stats.last ? new Date(stats.last.dateOperation).toLocaleDateString('fr-FR') : '—'}
          sub={stats.last ? `${formatMontant(stats.last.montant)} ${codeOf(stats.last.deviseId)}` : 'Aucun'}
        />
        <StatCard tone="amber" icon={User} label="Encaissements" value={`${stats.count}`} sub="Au total" />
      </div>

      <Panel>
        <PanelHeader title="Nouvel encaissement" />
        <form onSubmit={submit} className="grid gap-4 p-[18px] sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <p className="flex items-center gap-1.5 text-[11px] text-[#64748B]">
              <Landmark className="h-3.5 w-3.5" /> Recette <ArrowRight className="h-3.5 w-3.5" />
              <Landmark className="h-3.5 w-3.5" /> Caisse — l'argent entre dans la caisse choisie.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="caisse" className={labelClass}>
              Caisse
            </label>
            <select id="caisse" className={selectClass} value={caisseId} onChange={(e) => setCaisseId(e.target.value)}>
              <option value="">— Choisir —</option>
              {openCaisses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.libelle}
                </option>
              ))}
            </select>
            {openCaisses.length === 0 && <p className="text-[11px] text-[#64748B]">Aucune caisse ouverte.</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="montant" className={labelClass}>
              Montant
            </label>
            <input
              id="montant"
              type="number"
              min="0"
              step="0.0001"
              className={inputClass}
              value={montant}
              onChange={(e) => setMontant(e.target.value)}
              placeholder="Ex : 100000"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="clientNom" className={labelClass}>
              Client (nom)
            </label>
            <input
              id="clientNom"
              className={inputClass}
              value={clientNom}
              onChange={(e) => setClientNom(e.target.value)}
              placeholder="Nom du client / payeur"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="clientNumero" className={labelClass}>
              Client (numéro)
            </label>
            {/* Choisi dans le référentiel local plutôt que saisi : le numéro
                client est un identifiant SAP (KUNNR), une saisie libre laissait
                passer des lettres que le serveur refuse ensuite. */}
            <ClientSelect
              value={clientNumero}
              onChange={(numero, raisonSociale) => {
                setClientNumero(numero);
                // Le nom déjà saisi à la main n'est pas écrasé sans raison.
                if (raisonSociale && !clientNom.trim()) setClientNom(raisonSociale);
              }}
              placeholder="Rechercher un client (optionnel)…"
            />
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label htmlFor="motif" className={labelClass}>
              Motif / provenance
            </label>
            <input
              id="motif"
              className={inputClass}
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              placeholder="Ex : règlement facture, dotation banque…"
            />
          </div>

          <div className="flex items-center gap-3 sm:col-span-2">
            <button
              type="submit"
              disabled={!valid || encaissement.isPending}
              className="rounded-[9px] bg-[#0F4C81] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#1A6DB5] disabled:opacity-50"
            >
              {encaissement.isPending ? 'Encaissement…' : 'Encaisser'}
            </button>
            {done && !encaissement.isPending && (
              <span className="text-sm font-medium text-[#16A34A]">Encaissement enregistré.</span>
            )}
            {encaissement.isError && (
              <span className="text-sm text-destructive">
                {apiErrorMessage(encaissement.error, 'Encaissement impossible')}
              </span>
            )}
          </div>
        </form>
      </Panel>

      <Panel>
        <PanelHeader title="Derniers encaissements" badge={`${stats.count}`} />
        <table className="w-full text-xs">
          <thead className="bg-[#F8FAFC]">
            <tr className="text-left text-[10px] uppercase tracking-[0.7px] text-[#64748B]">
              <SortableHeader column="date" state={sort.state} onSort={sort.setSort}>Date</SortableHeader>
              <SortableHeader column="montant" state={sort.state} onSort={sort.setSort}>Montant</SortableHeader>
              <SortableHeader column="client" state={sort.state} onSort={sort.setSort}>Client</SortableHeader>
              <SortableHeader column="motif" state={sort.state} onSort={sort.setSort}>Motif</SortableHeader>
            </tr>
          </thead>
          <tbody>
            {(encOps ?? []).length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-[#64748B]">
                  Aucun encaissement pour le moment.
                </td>
              </tr>
            )}
            {encVisibles.map((o) => (
              <tr key={o.id} className="border-t border-[rgba(15,76,129,0.07)]">
                <td className="px-4 py-3 text-[#64748B]">
                  {new Date(o.dateOperation).toLocaleDateString('fr-FR')}
                </td>
                <td className="px-4 py-3 font-medium">
                  {formatMontant(o.montant)} {codeOf(o.deviseId)}
                </td>
                <td className="px-4 py-3">
                  {o.clientNom || '—'}
                  {o.clientNumero ? <span className="text-[#94A3B8]"> ({o.clientNumero})</span> : null}
                </td>
                <td className="px-4 py-3 text-[#64748B]">{o.motif || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {(encOps ?? []).length > ENC_MAX_LIGNES && (
          <div className="border-t border-[rgba(15,76,129,0.07)] px-4 py-2 text-[11px] text-[#94A3B8]">
            {ENC_MAX_LIGNES} lignes affichées sur {(encOps ?? []).length}
            {sort.state.by ? ' — les premières du tri choisi.' : ' — les plus récentes.'}
          </div>
        )}
      </Panel>
    </div>
  );
}
