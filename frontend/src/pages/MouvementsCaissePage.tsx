import { useEffect, useMemo, useState } from 'react';
import { ArrowDownToLine, ArrowRight, Calendar, CalendarRange, Landmark, Plus, Repeat, TrendingUp, Wallet, X } from 'lucide-react';
import { usePortefeuilles, useDevises } from '@/api/financierRef';
import { listPartenaires } from '@/api/referentiel';
import { useOperations } from '@/api/ledger';
import { useMyBonPerimeter } from '@/api/bons';
import { useRecharge } from '@/api/recharge';
import { useEncaissement } from '@/api/encaissement';
import { useDeviseReference, useTauxCourants } from '@/api/tauxChange';
import { ClientSelect } from '@/components/ClientSelect';
import { apiErrorMessage, cn, formatMontant } from '@/lib/utils';
import type { RechargeSens } from '@/types/api';
import { StatCard } from '@/components/ui/stat-card';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { CharCounter } from '@/components/ui/char-counter';
import { SortableHeader } from '@/components/SortableHeader';
import { useTableSort } from '@/hooks/useTableSort';
import { useCaisseDevise } from '@/hooks/useCaisseDevise';
import { AucuneCaisseMessage } from '@/components/AucuneCaisseMessage';

const MVT_SORT_COLUMNS = ['dateOperation', 'montant'] as const;
type MvtSortCol = (typeof MVT_SORT_COLUMNS)[number];

/** Date du jour au format YYYY-MM-DD (heure locale). */
function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const selectClass =
  'h-10 w-full rounded-[9px] border border-[rgba(15,76,129,0.1)] bg-white px-3 text-sm text-[#0F172A] outline-none transition focus:border-[#1A6DB5] disabled:opacity-50';
const inputClass =
  'h-10 w-full rounded-[9px] border border-[rgba(15,76,129,0.1)] bg-white px-3 text-sm text-[#0F172A] outline-none transition focus:border-[#1A6DB5]';
const labelClass = 'text-[11px] font-semibold uppercase tracking-[0.6px] text-[#64748B]';

// Montant + devise sur une même ligne. On REMPLACE `w-full` au lieu d'ajouter une
// autre largeur : deux classes de largeur concurrentes se départagent par l'ordre
// de la feuille Tailwind, et `w-full` l'emporte — le select occupait toute la
// ligne et le champ montant disparaissait.
const montantInputClass = inputClass.replace('w-full', 'flex-1 min-w-0');
const deviseSelectClass = selectClass.replace('w-full', 'w-24 shrink-0');

export type MouvementMode = 'ENCAISSEMENT' | 'RECHARGE';

/**
 * Page unifiée « Mouvements de caisse » : Encaissement (entrée d'argent dans une
 * caisse) et Recharge (caisse ↔ portefeuille) derrière une même bascule. Les deux
 * gestes partent d'une caisse et sont réservés aux mêmes rôles (caissier + admins).
 */
export function MouvementsCaissePage({ initialMode = 'ENCAISSEMENT' }: { initialMode?: MouvementMode }) {
  const [mode, setMode] = useState<MouvementMode>(initialMode);

  // Données partagées.
  const { data: perimeter } = useMyBonPerimeter();
  const caisses = perimeter?.caisses;
  const openCaisses = useMemo(
    () => (caisses ?? []).filter((c) => c.statut === 'OUVERTE'),
    [caisses],
  );
  const { data: allPortefeuilles } = usePortefeuilles();
  const { data: devises } = useDevises();

  // Historique : filtre par date + tri exécutés côté serveur (comme les autres pages).
  // Par défaut, on n'affiche que la journée du JOUR.
  const today = todayLocal();
  const [dateFrom, setDateFrom] = useState(() => todayLocal());
  const [dateTo, setDateTo] = useState(() => todayLocal());
  const sort = useTableSort<MvtSortCol>('/mouvements', MVT_SORT_COLUMNS);
  const { data: ops } = useOperations({
    type: mode,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    sortBy: sort.state.by ?? undefined,
    sortDir: sort.state.by ? sort.state.dir : undefined,
  });

  const encaissement = useEncaissement();
  const recharge = useRecharge();

  // Formulaire de saisie en modale (déclenché par un bouton).
  const [formOpen, setFormOpen] = useState(false);

  // Champs communs.
  const [montant, setMontant] = useState('');
  const [done, setDone] = useState(false);

  // Champs encaissement.
  const [encCaisseId, setEncCaisseId] = useState('');
  // Devise reçue : par défaut celle de la caisse choisie, modifiable.
  const [encDeviseId, setEncDeviseId] = useState('');
  const [clientNom, setClientNom] = useState('');
  const [clientNumero, setClientNumero] = useState('');
  const [sapCheck, setSapCheck] = useState<{ checking: boolean; error: string | null }>({ checking: false, error: null });
  const [clientSapStatus, setClientSapStatus] = useState<'idle' | 'checking' | 'found' | 'notfound' | 'error'>('idle');
  const [encMotif, setEncMotif] = useState('');
  // Taux réellement obtenu. `tauxTouche` distingue « le caissier a saisi ce
  // taux » de « c'est le cours du jour pré-rempli » : sans ce drapeau, changer
  // de devise écraserait un taux que le caissier venait de taper.
  const [taux, setTaux] = useState('');
  const [tauxTouche, setTauxTouche] = useState(false);

  // Champs recharge.
  const [sens, setSens] = useState<RechargeSens>('CAISSE_VERS_PORTEFEUILLE');
  const inverse = sens === 'PORTEFEUILLE_VERS_CAISSE';
  const [rechCaisseId, setRechCaisseId] = useState('');
  const [portefeuilleId, setPortefeuilleId] = useState('');
  const [rechMotif, setRechMotif] = useState('');

  // caisse → portefeuille : tous les portefeuilles (la caisse est déduite du choix).
  // portefeuille → caisse : on filtre par la caisse destination sélectionnée.
  const portefeuilles = inverse
    ? (allPortefeuilles ?? []).filter((p) => !rechCaisseId || String(p.caisseSourceId) === String(rechCaisseId))
    : (allPortefeuilles ?? []);

  // On repart propre à chaque changement de mode (message de succès + montant).
  useEffect(() => {
    setDone(false);
    setMontant('');
  }, [mode]);

  const codeOf = (deviseId?: string | null) => (devises ?? []).find((d) => d.id === deviseId)?.code ?? '';
  const deviseOf = (deviseId?: string | null) => (devises ?? []).find((d) => d.id === deviseId);
  const { deviseDeLaCaisse, caissesPourDevise, caisseEvidentePourDevise } =
    useCaisseDevise(openCaisses);
  const deviseCaisseEnc = deviseDeLaCaisse(encCaisseId);

  /** Choisir une caisse renseigne sa devise déclarée. */
  const choisirCaisseEnc = (id: string) => {
    setEncCaisseId(id);
    const d = deviseDeLaCaisse(id);
    if (d) setEncDeviseId(d);
  };

  /** Choisir une devise présélectionne la caisse s'il n'y a qu'une candidate. */
  const choisirDeviseEnc = (id: string) => {
    setEncDeviseId(id);
    const evidente = caisseEvidentePourDevise(id);
    if (evidente) setEncCaisseId(evidente);
  };

  /* ---- Taux de change ---------------------------------------------------- */
  const { data: reference } = useDeviseReference();
  const { data: tauxCourants } = useTauxCourants();

  /**
   * Le taux est exigé dès que l'argent reçu n'est pas dans la devise DE LA
   * CAISSE — c'est elle qui sera créditée, les devises étrangères étant
   * converties au guichet (décision du 12/08/2026). La comparaison portait sur
   * la devise de RÉFÉRENCE : pour une caisse en USD recevant des francs, l'écran
   * n'aurait rien demandé alors que le serveur refuse désormais l'opération.
   */
  const besoinTaux =
    mode === 'ENCAISSEMENT' &&
    !!encDeviseId &&
    !!deviseCaisseEnc &&
    String(encDeviseId) !== String(deviseCaisseEnc);

  /**
   * Cours du jour pour cette devise, dans le sens qui nous intéresse. Le
   * référentiel ne tient qu'UN sens par couple : si c'est l'autre qui est
   * stocké, on prend le taux inverse, déjà calculé par le serveur.
   */
  const coursDuJour = useMemo(() => {
    if (!besoinTaux || !reference) return undefined;
    // Le référentiel ne cote que contre la devise de RÉFÉRENCE. Si la caisse est
    // tenue dans une autre monnaie, aucun cours ne donne le bon sens : mieux
    // vaut ne rien pré-remplir que de proposer un taux faux — le caissier saisit
    // alors celui qu'il a réellement obtenu.
    if (String(deviseCaisseEnc) !== String(reference.id)) return undefined;
    const direct = (tauxCourants ?? []).find(
      (t) => t.deviseSourceId === String(encDeviseId) && t.deviseCibleId === String(reference.id),
    );
    if (direct) return { valeur: direct.taux, perime: direct.perime };
    const inverse = (tauxCourants ?? []).find(
      (t) => t.deviseSourceId === String(reference.id) && t.deviseCibleId === String(encDeviseId),
    );
    if (inverse) return { valeur: inverse.tauxInverse, perime: inverse.perime };
    return undefined;
  }, [besoinTaux, tauxCourants, encDeviseId, reference, deviseCaisseEnc]);

  // Pré-remplissage : uniquement tant que le caissier n'a rien tapé lui-même.
  useEffect(() => {
    if (!besoinTaux) {
      setTaux('');
      setTauxTouche(false);
      return;
    }
    if (!tauxTouche) setTaux(coursDuJour?.valeur ?? '');
  }, [besoinTaux, coursDuJour, tauxTouche]);

  const contreValeur = useMemo(() => {
    const m = Number(montant);
    const t = Number(taux);
    if (!besoinTaux || !(m > 0) || !(t > 0)) return null;
    // Arrondi aux décimales de la devise CRÉDITÉE — le serveur fait le même
    // calcul, et l'écran ne doit pas annoncer un montant qu'il démentira.
    return (m * t).toFixed(deviseOf(deviseCaisseEnc)?.nbDecimales ?? 0);
  }, [besoinTaux, montant, taux, deviseCaisseEnc, devises]);

  const busy = mode === 'ENCAISSEMENT' ? encaissement.isPending : recharge.isPending;
  const error = mode === 'ENCAISSEMENT' ? encaissement.error : recharge.error;
  const isError = mode === 'ENCAISSEMENT' ? encaissement.isError : recharge.isError;

  const valid =
    mode === 'ENCAISSEMENT'
      // La devise est EXIGÉE : sans elle, le serveur retomberait sur celle de la
      // caisse et l'écriture porterait une monnaie que l'écran n'affichait pas.
      // Le taux l'est aussi dès que la devise est étrangère : c'est précisément
      // ce qu'on ne savait pas enregistrer jusqu'ici.
      ? !!encCaisseId && !!encDeviseId && Number(montant) > 0 && (!besoinTaux || Number(taux) > 0)
      : !!rechCaisseId && !!portefeuilleId && Number(montant) > 0;

  const stats = useMemo(() => {
    const list = ops ?? [];
    const byDevise = new Map<string, number>();
    for (const o of list) {
      const k = String(o.deviseId);
      byDevise.set(k, (byDevise.get(k) ?? 0) + Number(o.montant || 0));
    }
    const totals = [...byDevise.entries()]
      .map(([deviseId, total]) => ({ deviseId, total }))
      .sort((a, b) => b.total - a.total);
    return { totals, last: list[0], count: list.length };
  }, [ops]);

  // Remise à zéro des champs (saisie + sélections + états de vérif/résultat).
  const resetFields = () => {
    setMontant('');
    setClientNom('');
    setClientNumero('');
    setEncMotif('');
    setRechMotif('');
    setEncCaisseId('');
    setEncDeviseId('');
    // Le taux redevient une proposition : l'encaissement suivant peut très bien
    // avoir été négocié à un autre cours.
    setTaux('');
    setTauxTouche(false);
    setRechCaisseId('');
    setPortefeuilleId('');
    setSens('CAISSE_VERS_PORTEFEUILLE');
    setSapCheck({ checking: false, error: null });
    setClientSapStatus('idle');
    setDone(false);
    encaissement.reset();
    recharge.reset();
  };
  // On réinitialise À L'OUVERTURE et À LA FERMETURE → formulaire toujours vierge.
  const openForm = () => {
    resetFields();
    setFormOpen(true);
  };
  const closeForm = () => {
    resetFields();
    setFormOpen(false);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setDone(false);
    setSapCheck({ checking: false, error: null });
    if (mode === 'ENCAISSEMENT') {
      // Contrôle dans le RÉFÉRENTIEL LOCAL (clients importés de SAP) plutôt que
      // par appel SAP : instantané, et l'encaissement reste possible si la
      // liaison SAP est coupée. Le numéro vient normalement du sélecteur, ce
      // contrôle ne sert que si la valeur a une autre origine.
      if (clientNumero.trim()) {
        setSapCheck({ checking: true, error: null });
        try {
          const num = clientNumero.trim();
          const trouves = await listPartenaires({ type: 'CLIENT', search: num, limit: 30 });
          if (!trouves.some((c) => String(c.numeroClient) === num)) {
            setSapCheck({
              checking: false,
              error: `Le client « ${num} » est introuvable dans le référentiel. Synchronisez les clients depuis SAP (Master Data → Clients).`,
            });
            return;
          }
        } catch {
          /* Référentiel injoignable : on laisse passer, le serveur revalidera */
        }
        setSapCheck({ checking: false, error: null });
      }
      encaissement.mutate(
        {
          caisseId: encCaisseId,
          montant,
          deviseId: encDeviseId || undefined,
          clientNom: clientNom.trim() || undefined,
          clientNumero: clientNumero.trim() || undefined,
          motif: encMotif.trim() || undefined,
          // Le serveur refuse un taux sur un encaissement déjà libellé dans la
          // devise de référence : on ne l'envoie que s'il a un sens.
          tauxApplique: besoinTaux ? taux : undefined,
        },
        {
          onSuccess: () => {
            setDone(true);
            setMontant('');
            setClientNom('');
            setClientNumero('');
            setEncMotif('');
            setTaux('');
            setTauxTouche(false);
            setFormOpen(false);
          },
        },
      );
    } else {
      recharge.mutate(
        { caisseId: rechCaisseId, portefeuilleId, montant, reference: rechMotif || undefined, sens },
        {
          onSuccess: () => {
            setDone(true);
            setMontant('');
            setRechMotif('');
            setFormOpen(false);
          },
        },
      );
    }
  };

  const isEnc = mode === 'ENCAISSEMENT';

  return (
    <div className="flex flex-col gap-4">
      {/* Bascule de mode + bouton d'ajout */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex w-full max-w-md rounded-[10px] border border-[rgba(15,76,129,0.12)] bg-white p-0.5">
          <button
            type="button"
            onClick={() => setMode('ENCAISSEMENT')}
            className={cn(
              'inline-flex flex-1 items-center justify-center gap-1.5 rounded-[8px] px-3 py-2 text-xs font-semibold transition',
              isEnc ? 'bg-[#0F4C81] text-white' : 'text-[#475569] hover:bg-[#F1F5F9]',
            )}
          >
            <ArrowDownToLine className="h-4 w-4" /> Encaissement
          </button>
          <button
            type="button"
            onClick={() => setMode('RECHARGE')}
            className={cn(
              'inline-flex flex-1 items-center justify-center gap-1.5 rounded-[8px] px-3 py-2 text-xs font-semibold transition',
              !isEnc ? 'bg-[#0F4C81] text-white' : 'text-[#475569] hover:bg-[#F1F5F9]',
            )}
          >
            <Repeat className="h-4 w-4" /> Recharge
          </button>
        </div>
        <div className="flex items-center gap-3">
          {done && (
            <span className="text-sm font-medium text-[#059669]">
              {isEnc ? 'Encaissement enregistré.' : 'Recharge effectuée.'}
            </span>
          )}
          <button
            type="button"
            onClick={openForm}
            className="flex items-center gap-1.5 rounded-[9px] bg-[#0F4C81] px-3.5 py-2 text-xs font-medium text-white transition hover:bg-[#1A6DB5]"
          >
            <Plus className="h-4 w-4" /> {isEnc ? 'Nouvel encaissement' : 'Nouvelle recharge'}
          </button>
        </div>
      </div>

      {/* Statistiques du mode courant */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          tone="green"
          icon={TrendingUp}
          label={isEnc ? 'Total encaissé' : 'Total rechargé'}
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
          label={isEnc ? 'Dernier encaissement' : 'Dernière recharge'}
          value={stats.last ? new Date(stats.last.dateOperation).toLocaleDateString('fr-FR') : '—'}
          sub={stats.last ? `${formatMontant(stats.last.montant)} ${codeOf(stats.last.deviseId)}` : 'Aucun'}
        />
        <StatCard
          tone="amber"
          icon={isEnc ? ArrowDownToLine : Repeat}
          label={isEnc ? 'Encaissements' : 'Recharges'}
          value={`${stats.count}`}
          sub="Au total"
        />
      </div>

      {/* Formulaire adaptatif — en modale, ouvert via le bouton */}
      {formOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center"
          onClick={closeForm}
        >
          <div className="w-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
            <Panel>
              <PanelHeader title={isEnc ? 'Nouvel encaissement' : 'Nouvelle recharge'}>
                <button
                  type="button"
                  aria-label="Fermer"
                  onClick={closeForm}
                  className="ml-auto flex h-7 w-7 items-center justify-center rounded-[7px] text-[#94A3B8] hover:bg-[#F1F5F9] hover:text-[#0F172A]"
                >
                  <X className="h-4 w-4" />
                </button>
              </PanelHeader>
        <form onSubmit={submit} className="grid gap-4 p-[18px] sm:grid-cols-2">
          {isEnc ? (
            <>
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <p className="flex items-center gap-1.5 text-[11px] text-[#64748B]">
                  <Landmark className="h-3.5 w-3.5" /> Recette <ArrowRight className="h-3.5 w-3.5" />
                  <Landmark className="h-3.5 w-3.5" /> Caisse — l'argent entre dans la caisse choisie.
                </p>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="enc-caisse" className={labelClass}>
                  Caisse (ouverte)
                </label>
                <select
                  id="enc-caisse"
                  className={selectClass}
                  value={encCaisseId}
                  onChange={(e) => choisirCaisseEnc(e.target.value)}
                >
                  <option value="">— Choisir —</option>
                  {openCaisses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} — {c.libelle}
                    </option>
                  ))}
                </select>
                <AucuneCaisseMessage caisses={caisses} openCaisses={openCaisses} />
                {/* Plusieurs caisses déclarent cette devise : on ne peut pas trancher
                    à la place du caissier, l'argent est dans un coffre précis. */}
                {!encCaisseId && encDeviseId && caissesPourDevise(encDeviseId).length > 1 && (
                  <p className="text-[11px] text-[#64748B]">
                    {caissesPourDevise(encDeviseId).length} caisses en {codeOf(encDeviseId)} — précisez
                    laquelle reçoit l'argent.
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="enc-montant" className={labelClass}>
                  Montant
                </label>
                <div className="flex gap-2">
                  <input
                    id="enc-montant"
                    type="number"
                    min="0"
                    step="0.0001"
                    className={montantInputClass}
                    value={montant}
                    onChange={(e) => setMontant(e.target.value)}
                    placeholder="Ex : 100000"
                  />
                  {/* Devise reçue. La caisse a une devise déclarée mais peut en
                      détenir d'autres : sans ce choix, un règlement en dollars
                      serait enregistré en francs et le solde deviendrait faux. */}
                  <select
                    aria-label="Devise reçue"
                    title="Devise réellement reçue"
                    className={encDeviseId ? deviseSelectClass : `${deviseSelectClass} border-[#FECDCA]`}
                    value={encDeviseId}
                    onChange={(e) => choisirDeviseEnc(e.target.value)}
                  >
                    <option value="">—</option>
                    {(devises ?? []).map((d) => (
                      <option key={d.id} value={String(d.id)}>
                        {d.code}
                      </option>
                    ))}
                  </select>
                </div>
                {!encDeviseId && (
                  <p className="text-[11px] text-[#B42318]">Choisissez la devise reçue.</p>
                )}
                {encCaisseId && encDeviseId && encDeviseId !== deviseCaisseEnc && (
                  <p className="text-[11px] text-[#B45309]">
                    Devise différente de celle de la caisse — les {codeOf(encDeviseId)} seront changés
                    au guichet et c’est leur contre-valeur en {codeOf(deviseCaisseEnc)} qui entrera en
                    caisse.
                  </p>
                )}
              </div>

              {/* Taux réellement obtenu. Le cours du jour n'est qu'une
                  proposition : deux encaissements du même jour peuvent avoir été
                  négociés différemment, et c'est ce qui s'est passé qu'on
                  enregistre. */}
              {besoinTaux && (
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="enc-taux" className={labelClass}>
                    Taux obtenu — 1 {codeOf(encDeviseId)} en {codeOf(deviseCaisseEnc)}
                  </label>
                  <input
                    id="enc-taux"
                    inputMode="decimal"
                    placeholder="Ex : 590"
                    className={inputClass}
                    value={taux}
                    onChange={(e) => {
                      setTaux(e.target.value);
                      setTauxTouche(true);
                    }}
                  />
                  {contreValeur ? (
                    <p className="text-[11px] text-[#0F172A]">
                      Entrera en caisse :{' '}
                      <strong>
                        {formatMontant(contreValeur)} {codeOf(deviseCaisseEnc)}
                      </strong>
                      {coursDuJour && taux !== coursDuJour.valeur && (
                        <span className="text-[#B45309]"> · cours du jour : {coursDuJour.valeur}</span>
                      )}
                    </p>
                  ) : (
                    <p className="text-[11px] text-[#B42318]">
                      {coursDuJour
                        ? 'Corrigez le taux si vous avez obtenu autre chose.'
                        : `Taux obligatoire : sans lui, on ne sait pas combien de ${codeOf(deviseCaisseEnc)} entrent en caisse.`}
                    </p>
                  )}
                  {coursDuJour?.perime && (
                    <p className="text-[11px] text-[#B45309]">
                      Le cours proposé n’a pas été rafraîchi depuis longtemps — vérifiez-le.
                    </p>
                  )}
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <label htmlFor="enc-client" className={labelClass}>
                  Client (nom)
                </label>
                <input
                  id="enc-client"
                  className={inputClass}
                  value={clientNom}
                  onChange={(e) => setClientNom(e.target.value)}
                  placeholder="Nom du client / payeur"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="enc-client-num" className={labelClass}>
                  Client (numéro)
                </label>
                {/* Autocomplétion sur le référentiel LOCAL (clients importés de
                    SAP) : plus d'aller-retour SAP à chaque saisie, et le nom du
                    client se remplit tout seul. */}
                <ClientSelect
                  value={clientNumero}
                  onChange={(numero, raisonSociale) => {
                    setClientNumero(numero);
                    // Le nom saisi à la main n'est pas écrasé sans raison :
                    // on ne le remplit que s'il est vide ou issu d'un choix.
                    if (raisonSociale) setClientNom(raisonSociale);
                    // Choisi dans le référentiel = client connu : on lève le
                    // blocage du bouton d'enregistrement sans interroger SAP.
                    setClientSapStatus(numero ? 'found' : 'idle');
                  }}
                  placeholder="Rechercher un client (nom ou numéro)…"
                />
              </div>

              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <label htmlFor="enc-motif" className={labelClass}>
                  Motif / provenance
                </label>
                <input
                  id="enc-motif"
                  className={inputClass}
                  value={encMotif}
                  onChange={(e) => setEncMotif(e.target.value)}
                  placeholder="Ex : règlement facture, dotation banque…"
                />
              </div>
            </>
          ) : (
            <>
              {/* Sens du mouvement */}
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <span className={labelClass}>Sens du mouvement</span>
                <div className="inline-flex w-full max-w-md rounded-[9px] border border-[rgba(15,76,129,0.12)] p-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setSens('CAISSE_VERS_PORTEFEUILLE');
                      setRechCaisseId('');
                      setPortefeuilleId('');
                    }}
                    className={cn(
                      'inline-flex flex-1 items-center justify-center gap-1.5 rounded-[7px] px-3 py-1.5 text-xs font-medium transition',
                      !inverse ? 'bg-[#0F4C81] text-white' : 'text-[#475569] hover:bg-[#F1F5F9]',
                    )}
                  >
                    <Landmark className="h-3.5 w-3.5" /> Caisse <ArrowRight className="h-3.5 w-3.5" />
                    <Wallet className="h-3.5 w-3.5" /> Portefeuille
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSens('PORTEFEUILLE_VERS_CAISSE');
                      setRechCaisseId('');
                      setPortefeuilleId('');
                    }}
                    className={cn(
                      'inline-flex flex-1 items-center justify-center gap-1.5 rounded-[7px] px-3 py-1.5 text-xs font-medium transition',
                      inverse ? 'bg-[#0F4C81] text-white' : 'text-[#475569] hover:bg-[#F1F5F9]',
                    )}
                  >
                    <Wallet className="h-3.5 w-3.5" /> Portefeuille <ArrowRight className="h-3.5 w-3.5" />
                    <Landmark className="h-3.5 w-3.5" /> Caisse
                  </button>
                </div>
                <p className="text-[11px] text-[#64748B]">
                  {inverse
                    ? "Renvoi : l'argent repart du portefeuille vers sa caisse source (limité au solde du portefeuille)."
                    : "Recharge : l'argent va de la caisse vers le portefeuille."}
                </p>
              </div>

              {/* Champ caisse (destination) — uniquement en sens inverse */}
              {inverse && (
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="rech-caisse" className={labelClass}>
                    Caisse destination (ouverte)
                  </label>
                  <select
                    id="rech-caisse"
                    className={selectClass}
                    value={rechCaisseId}
                    onChange={(e) => {
                      setRechCaisseId(e.target.value);
                      setPortefeuilleId('');
                    }}
                  >
                    <option value="">— Choisir —</option>
                    {openCaisses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code} — {c.libelle}
                      </option>
                    ))}
                  </select>
                  <AucuneCaisseMessage caisses={caisses} openCaisses={openCaisses} />
                </div>
              )}

              {/* Portefeuille */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="rech-ptf" className={labelClass}>
                  {inverse ? 'Portefeuille source' : 'Portefeuille cible'}
                </label>
                <select
                  id="rech-ptf"
                  className={selectClass}
                  value={portefeuilleId}
                  disabled={inverse && !rechCaisseId}
                  onChange={(e) => {
                    const pid = e.target.value;
                    setPortefeuilleId(pid);
                    // caisse → portefeuille : la caisse source est déduite du portefeuille choisi.
                    if (!inverse) {
                      const p = (allPortefeuilles ?? []).find((x) => String(x.id) === String(pid));
                      setRechCaisseId(p ? String(p.caisseSourceId) : '');
                    }
                  }}
                >
                  <option value="">— Choisir —</option>
                  {portefeuilles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} — {p.libelle}
                    </option>
                  ))}
                </select>
                {!inverse && rechCaisseId && (
                  <p className="text-[11px] text-[#64748B]">
                    Caisse source : {(caisses ?? []).find((c) => String(c.id) === String(rechCaisseId))?.code ?? '—'}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="rech-montant" className={labelClass}>
                  Montant
                </label>
                <input
                  id="rech-montant"
                  inputMode="decimal"
                  className={inputClass}
                  value={montant}
                  onChange={(e) => setMontant(e.target.value)}
                  placeholder="Ex : 50 000"
                />
              </div>

              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <label htmlFor="rech-motif" className={labelClass}>
                  Motif (optionnel)
                </label>
                <input
                  id="rech-motif"
                  className={inputClass}
                  value={rechMotif}
                  onChange={(e) => setRechMotif(e.target.value)}
                  placeholder="Motif de la recharge…"
                  maxLength={500}
                />
                <CharCounter value={rechMotif} max={500} />
              </div>
            </>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-[rgba(15,76,129,0.07)] pt-4 sm:col-span-2">
            {done && (
              <p className="mr-auto text-sm text-[#059669]">
                {isEnc ? 'Encaissement enregistré.' : 'Recharge effectuée.'}
              </p>
            )}
            {sapCheck.error && <p className="mr-auto text-sm text-[#EF4444]">{sapCheck.error}</p>}
            {isError && !sapCheck.error && (
              <p className="mr-auto text-sm text-[#EF4444]">
                {apiErrorMessage(error, isEnc ? 'Encaissement impossible' : 'Recharge impossible')}
              </p>
            )}
            <button
              type="submit"
              disabled={
                !valid ||
                busy ||
                sapCheck.checking ||
                (isEnc && (clientSapStatus === 'checking' || clientSapStatus === 'notfound'))
              }
              className="flex items-center gap-1.5 rounded-[9px] bg-[#0F4C81] px-4 py-2 text-xs font-medium text-white transition hover:bg-[#1A6DB5] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {sapCheck.checking || (isEnc && clientSapStatus === 'checking')
                ? 'Vérification SAP…'
                : busy
                  ? 'Traitement…'
                  : isEnc
                    ? 'Encaisser'
                    : 'Valider la recharge'}
            </button>
          </div>
        </form>
            </Panel>
          </div>
        </div>
      )}

      {/* Derniers mouvements du mode courant */}
      <Panel>
        <PanelHeader title={isEnc ? 'Derniers encaissements' : 'Dernières recharges'} badge={`${stats.count}`} />

        {/* Filtre par date (serveur) */}
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
              title="Revenir aux mouvements du jour"
              className="rounded-[9px] border border-[rgba(15,76,129,0.12)] bg-white px-3 py-1.5 text-xs font-medium text-[#475569] hover:bg-[#F1F5F9]"
            >
              Aujourd'hui
            </button>
          )}
          <span className="ml-auto text-[11px] text-[#64748B]">
            {stats.count} résultat{stats.count > 1 ? 's' : ''}
          </span>
        </div>

        <table className="w-full text-xs">
          <thead className="bg-[#F8FAFC]">
            <tr className="text-left text-[10px] uppercase tracking-[0.7px] text-[#64748B]">
              <SortableHeader column="dateOperation" state={sort.state} onSort={sort.setSort}>Date</SortableHeader>
              <SortableHeader column="montant" state={sort.state} onSort={sort.setSort}>Montant</SortableHeader>
              <th className="px-4 py-2.5 font-semibold">{isEnc ? 'Client' : 'Référence'}</th>
              <th className="px-4 py-2.5 font-semibold">Motif</th>
            </tr>
          </thead>
          <tbody>
            {(ops ?? []).length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-[#64748B]">
                  {dateFrom || dateTo
                    ? 'Aucun mouvement pour ces dates.'
                    : isEnc
                      ? 'Aucun encaissement pour le moment.'
                      : 'Aucune recharge pour le moment.'}
                </td>
              </tr>
            )}
            {(ops ?? []).map((o) => (
              <tr key={o.id} className="border-t border-[rgba(15,76,129,0.07)]">
                <td className="px-4 py-3 text-[#64748B]">{new Date(o.dateOperation).toLocaleDateString('fr-FR')}</td>
                <td className="px-4 py-3 font-medium">
                  {formatMontant(o.montant)} {codeOf(o.deviseId)}
                </td>
                <td className="px-4 py-3">
                  {isEnc ? (
                    <>
                      {o.clientNom || '—'}
                      {o.clientNumero ? <span className="text-[#94A3B8]"> ({o.clientNumero})</span> : null}
                    </>
                  ) : (
                    o.reference || '—'
                  )}
                </td>
                <td className="px-4 py-3 text-[#64748B]">{o.motif || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
