import { useEffect, useMemo, useState } from 'react';
import { BookText, CalendarRange, Plus, Search, Wallet, X } from 'lucide-react';
import {
  useBonsManuels,
  useCarnets,
  useCloturerCarnet,
  useCreateBonManuel,
  useCreateCarnet,
} from '@/api/bonsManuels';
import { useCaisses } from '@/api/caisses';
import { usePortefeuilles } from '@/api/financierRef';
import { useTypeBons, usePartenaires, useCostCenters } from '@/api/referentiel';
import { useUsers, useUserRoles } from '@/api/users';
import { useAuthStore } from '@/stores/auth.store';
import { apiErrorMessage, formatMontant } from '@/lib/utils';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SortableHeader } from '@/components/SortableHeader';
import { useTableSort } from '@/hooks/useTableSort';
import type { Carnet } from '@/types/api';

const BM_SORT_COLUMNS = ['numero', 'numeroManuel', 'montant', 'beneficiaireNom', 'dateDecaissement'] as const;
type BmSortCol = (typeof BM_SORT_COLUMNS)[number];

const selectClass =
  'h-10 w-full rounded-md border border-input bg-white px-3 text-sm text-[#0F172A] outline-none focus:border-primary focus:ring-2 focus:ring-primary/15';

function CarnetBadge({ statut }: { statut: Carnet['statut'] }) {
  const map = {
    ACTIF: 'bg-[#ECFDF5] text-[#047857]',
    EPUISE: 'bg-[#FFFBEB] text-[#B45309]',
    CLOTURE: 'bg-[#F1F5F9] text-[#64748B]',
  } as const;
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${map[statut]}`}>
      {statut === 'ACTIF' ? 'Actif' : statut === 'EPUISE' ? 'Épuisé' : 'Clôturé'}
    </span>
  );
}

export function BonsManuelsPage() {
  const user = useAuthStore((s) => s.user);
  const { data: roles } = useUserRoles(user?.id ?? null);
  const isAdmin = (roles ?? []).some((r) => r.code === 'ADMINISTRATEUR' || r.code === 'SUPER_ADMIN');

  const { data: carnets } = useCarnets();
  const { data: caisses } = useCaisses();
  const { data: users } = useUsers();

  const userById = useMemo(() => new Map((users ?? []).map((u) => [u.id, u])), [users]);
  const caisseById = useMemo(() => new Map((caisses ?? []).map((c) => [c.id, c])), [caisses]);

  // Recherche (BD, débounce) + filtre par dates (client) sur la liste des bons manuels.
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  // Modal de gestion des carnets (voir les carnets configurés / en créer un).
  const [carnetsOpen, setCarnetsOpen] = useState(false);

  const sort = useTableSort<BmSortCol>('/bons-manuels', BM_SORT_COLUMNS);
  const { data: bonsManuels } = useBonsManuels({
    search: debouncedSearch || undefined,
    sortBy: sort.state.by ?? undefined,
    sortDir: sort.state.by ? sort.state.dir : undefined,
  });

  // Le filtre par dates reste client-side (la recherche texte est faite en BD).
  const filteredBons = (bonsManuels ?? []).filter((b) => {
    if (dateFrom && new Date(b.dateDecaissement) < new Date(`${dateFrom}T00:00:00`)) return false;
    if (dateTo && new Date(b.dateDecaissement) > new Date(`${dateTo}T23:59:59.999`)) return false;
    return true;
  });
  const isDefaultView = !search && !dateFrom && !dateTo;
  const resetFilters = () => {
    setSearch('');
    setDateFrom('');
    setDateTo('');
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <BookText className="h-5 w-5 text-[#0F4C81]" />
          <h1 className="font-display text-base font-semibold text-[#0F172A]">Bons manuels</h1>
        </div>
        <Button variant="outline" size="sm" onClick={() => setCarnetsOpen(true)}>
          <BookText className="h-4 w-4" /> Carnets
        </Button>
      </div>

      {/* Saisie d'un bon manuel — pleine largeur */}
      <NouveauBonManuel />

      {/* Bons manuels récents */}
      <Panel>
        <PanelHeader title="Bons manuels" badge={`${bonsManuels?.length ?? 0}`} />

        {/* Recherche + filtre par dates */}
        <div className="flex flex-wrap items-center gap-2 border-b border-[rgba(15,76,129,0.07)] px-[18px] py-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#94A3B8]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher (n°, donneur, bénéficiaire, montant…)"
              className="h-9 w-full rounded-[9px] border border-[rgba(15,76,129,0.12)] bg-white pl-8 pr-3 text-xs text-[#0F172A] outline-none focus:border-[#1A6DB5]"
            />
          </div>
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
          {!isDefaultView && (
            <button
              type="button"
              onClick={resetFilters}
              className="rounded-[9px] border border-[rgba(15,76,129,0.12)] bg-white px-3 py-1.5 text-xs font-medium text-[#475569] hover:bg-[#F1F5F9]"
            >
              Réinitialiser
            </button>
          )}
          <span className="ml-auto text-[11px] text-[#64748B]">
            {filteredBons.length} résultat{filteredBons.length > 1 ? 's' : ''}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-[#F8FAFC] text-left text-[10px] uppercase tracking-[0.7px] text-[#64748B]">
              <tr>
                <SortableHeader column="numero" state={sort.state} onSort={sort.setSort}>N°</SortableHeader>
                <SortableHeader column="numeroManuel" state={sort.state} onSort={sort.setSort}>N° carnet</SortableHeader>
                <SortableHeader column="montant" state={sort.state} onSort={sort.setSort} align="right">Montant</SortableHeader>
                <th className="px-4 py-2 font-medium">Donneur d'ordre</th>
                <SortableHeader column="beneficiaireNom" state={sort.state} onSort={sort.setSort}>Bénéficiaire</SortableHeader>
                <SortableHeader column="dateDecaissement" state={sort.state} onSort={sort.setSort}>Date</SortableHeader>
              </tr>
            </thead>
            <tbody>
              {filteredBons.map((b) => (
                <tr key={b.id} className="border-b last:border-0">
                  <td className="px-4 py-2 font-medium text-[#0F172A]">{b.numero}</td>
                  <td className="px-4 py-2">{b.numeroManuel}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatMontant(b.montant)}</td>
                  <td className="px-4 py-2">
                    {b.donneurOrdreUserId
                      ? (() => {
                          const u = userById.get(b.donneurOrdreUserId);
                          return u ? `${u.prenom} ${u.nom}` : b.donneurOrdreUserId;
                        })()
                      : (b.donneurOrdreNom ?? '—')}
                  </td>
                  <td className="px-4 py-2">{b.beneficiaireNom}</td>
                  <td className="px-4 py-2">{new Date(b.dateDecaissement).toLocaleDateString('fr-FR')}</td>
                </tr>
              ))}
              {filteredBons.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-[#94A3B8]">
                    {isDefaultView ? 'Aucun bon manuel.' : 'Aucun bon manuel pour ces filtres.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Modal : carnets configurés / disponibles + création */}
      {carnetsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setCarnetsOpen(false)}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-[13px] border border-[rgba(15,76,129,0.1)] bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[rgba(15,76,129,0.07)] bg-[#F8FAFC] px-5 py-3">
              <div className="flex items-center gap-2 font-display text-sm font-semibold text-[#0F172A]">
                <BookText className="h-4 w-4 text-[#0F4C81]" />
                Carnets {carnets ? `(${carnets.length})` : ''}
              </div>
              <button
                type="button"
                aria-label="Fermer"
                onClick={() => setCarnetsOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-[7px] text-[#94A3B8] hover:bg-white hover:text-[#0F172A]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 overflow-y-auto p-4">
              {/* Liste des carnets configurés / disponibles */}
              <div className="overflow-hidden rounded-[10px] border border-[rgba(15,76,129,0.1)]">
                <div className="border-b border-[rgba(15,76,129,0.07)] bg-[#F8FAFC] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.6px] text-[#64748B]">
                  Carnets configurés
                </div>
                <div className="divide-y divide-[rgba(15,76,129,0.06)]">
                  {(carnets ?? []).length === 0 && (
                    <div className="px-4 py-8 text-center text-sm text-[#94A3B8]">
                      Aucun carnet configuré.
                    </div>
                  )}
                  {(carnets ?? []).map((c) => (
                    <CarnetRow
                      key={c.id}
                      carnet={c}
                      caisseLabel={caisseById.get(c.caisseId)?.libelle}
                      isAdmin={isAdmin}
                    />
                  ))}
                </div>
              </div>

              {/* Création d'un carnet (admin) */}
              {isAdmin ? (
                <NouveauCarnet />
              ) : (
                <p className="text-[11px] text-[#64748B]">
                  La création de carnet est réservée aux administrateurs.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CarnetRow({
  carnet,
  caisseLabel,
  isAdmin,
}: {
  carnet: Carnet;
  caisseLabel?: string;
  isAdmin: boolean;
}) {
  const cloturer = useCloturerCarnet();
  return (
    <div className="flex flex-wrap items-center gap-3 px-[18px] py-3 text-sm">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-[#0F172A]">{carnet.libelle || `Carnet ${carnet.numeroDebut}–${carnet.numeroFin}`}</span>
          <CarnetBadge statut={carnet.statut} />
        </div>
        <div className="mt-0.5 text-[11px] text-[#64748B]">
          {caisseLabel ? `${caisseLabel} · ` : ''}plage {carnet.numeroDebut}–{carnet.numeroFin} · prochain n° {carnet.prochainNumero}
        </div>
      </div>
      {isAdmin && carnet.statut !== 'CLOTURE' && (
        <Button variant="outline" size="sm" disabled={cloturer.isPending} onClick={() => cloturer.mutate(carnet.id)}>
          Clôturer
        </Button>
      )}
    </div>
  );
}

function NouveauCarnet() {
  const create = useCreateCarnet();
  const { data: caisses } = useCaisses();
  const { data: users } = useUsers();
  const [caisseId, setCaisseId] = useState('');
  const [caissierId, setCaissierId] = useState('');
  const [libelle, setLibelle] = useState('');
  const [debut, setDebut] = useState('');
  const [fin, setFin] = useState('');

  const canSubmit =
    caisseId && caissierId && debut !== '' && fin !== '' && Number(fin) >= Number(debut) && !create.isPending;

  function submit() {
    create.mutate(
      {
        caisseId,
        caissierId,
        libelle: libelle.trim() || undefined,
        numeroDebut: Number(debut),
        numeroFin: Number(fin),
      },
      {
        onSuccess: () => {
          setLibelle('');
          setDebut('');
          setFin('');
        },
      },
    );
  }

  return (
    <Panel>
      <PanelHeader title="Nouveau carnet (admin)" />
      <div className="space-y-3 p-[18px]">
        <div className="space-y-1.5">
          <Label>Caisse</Label>
          <select aria-label="Caisse" className={selectClass} value={caisseId} onChange={(e) => setCaisseId(e.target.value)}>
            <option value="">— Choisir —</option>
            {(caisses ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} — {c.libelle}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Caissier détenteur</Label>
          <select aria-label="Caissier détenteur" className={selectClass} value={caissierId} onChange={(e) => setCaissierId(e.target.value)}>
            <option value="">— Choisir —</option>
            {(users ?? []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.prenom} {u.nom}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Libellé (optionnel)</Label>
          <Input value={libelle} onChange={(e) => setLibelle(e.target.value)} placeholder="Carnet juin…" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>N° début</Label>
            <Input inputMode="numeric" value={debut} onChange={(e) => setDebut(e.target.value.replace(/\D/g, ''))} placeholder="1000" />
          </div>
          <div className="space-y-1.5">
            <Label>N° fin</Label>
            <Input inputMode="numeric" value={fin} onChange={(e) => setFin(e.target.value.replace(/\D/g, ''))} placeholder="1050" />
          </div>
        </div>
        {create.isError && <p className="text-sm text-destructive">{apiErrorMessage(create.error, 'Création impossible')}</p>}
        <Button disabled={!canSubmit} onClick={submit} className="w-full">
          <Plus className="h-4 w-4" /> Créer le carnet
        </Button>
      </div>
    </Panel>
  );
}

function NouveauBonManuel() {
  const create = useCreateBonManuel();
  const { data: carnets } = useCarnets('ACTIF');
  const { data: portefeuilles } = usePortefeuilles();
  const { data: users } = useUsers();
  const { data: typeBons } = useTypeBons();
  const { data: partenaires } = usePartenaires();
  const { data: costCenters } = useCostCenters();

  const [carnetId, setCarnetId] = useState('');
  const [numeroManuel, setNumeroManuel] = useState('');
  const [portefeuilleId, setPortefeuilleId] = useState('');
  const [montant, setMontant] = useState('');
  // Mêmes champs qu'un bon normal :
  const [typeBonId, setTypeBonId] = useState('');
  const [libelle, setLibelle] = useState('');
  const [costCenterId, setCostCenterId] = useState('');
  const [partenaireId, setPartenaireId] = useState('');
  const [numeroBl, setNumeroBl] = useState('');
  const [codeManutention, setCodeManutention] = useState('');
  const [numeroClient, setNumeroClient] = useState('');
  const [description, setDescription] = useState('');
  const [ordreMode, setOrdreMode] = useState<'user' | 'nom'>('user');
  const [donneurUserId, setDonneurUserId] = useState('');
  const [donneurNom, setDonneurNom] = useState('');
  const [beneficiaireNom, setBeneficiaireNom] = useState('');
  const [motif, setMotif] = useState('');

  const carnet = (carnets ?? []).find((c) => c.id === carnetId);
  // Pré-remplit le prochain numéro à la sélection du carnet.
  function onSelectCarnet(id: string) {
    setCarnetId(id);
    const c = (carnets ?? []).find((x) => x.id === id);
    if (c) setNumeroManuel(String(c.prochainNumero));
  }

  // Champs conditionnels selon le TYPE de bon (comme le bon normal) :
  // partenaire / N° document (BL) / N° client requis selon les flags du type.
  const selectedTypeBon = (typeBons ?? []).find((t) => t.id === typeBonId);
  const reqPartenaire = selectedTypeBon?.requiertPartenaire ?? false;
  const reqBl = selectedTypeBon?.requiertBl ?? false;
  const reqNumeroClient = selectedTypeBon?.requiertNumeroClient ?? false;

  const montantValid = /^\d+(\.\d{1,4})?$/.test(montant) && Number(montant) > 0;
  const ordreOk = ordreMode === 'user' ? !!donneurUserId : donneurNom.trim().length > 0;
  const canSubmit =
    !!carnetId &&
    numeroManuel !== '' &&
    !!portefeuilleId &&
    montantValid &&
    !!typeBonId &&
    libelle.trim().length > 0 &&
    (!reqBl || numeroBl.trim().length > 0) &&
    (!reqPartenaire || !!partenaireId) &&
    (!reqNumeroClient || numeroClient.trim().length > 0) &&
    codeManutention.trim().length > 0 &&
    !!costCenterId &&
    ordreOk &&
    beneficiaireNom.trim().length > 0 &&
    !create.isPending;

  function submit() {
    create.mutate(
      {
        carnetId,
        numeroManuel: Number(numeroManuel),
        portefeuilleId,
        montant,
        typeBonId,
        libelle: libelle.trim(),
        partenaireId: reqPartenaire ? partenaireId || undefined : undefined,
        numeroBl: reqBl ? numeroBl.trim() : '',
        codeManutention: codeManutention.trim(),
        costCenterId,
        numeroClient: reqNumeroClient ? numeroClient.trim() || undefined : undefined,
        description: description.trim() || undefined,
        donneurOrdreUserId: ordreMode === 'user' ? donneurUserId : undefined,
        donneurOrdreNom: ordreMode === 'nom' ? donneurNom.trim() : undefined,
        beneficiaireNom: beneficiaireNom.trim(),
        motif: motif.trim() || undefined,
      },
      {
        onSuccess: () => {
          setMontant('');
          setLibelle('');
          setNumeroBl('');
          setCodeManutention('');
          setNumeroClient('');
          setDescription('');
          setPartenaireId('');
          setBeneficiaireNom('');
          setMotif('');
          setDonneurNom('');
          setDonneurUserId('');
          // recharge le prochain numéro du carnet
          if (carnet) setNumeroManuel(String(carnet.prochainNumero + 1));
        },
      },
    );
  }

  return (
    <Panel>
      <PanelHeader title="Nouveau bon manuel">
        <Wallet className="ml-auto h-4 w-4 text-[#0F4C81]" />
      </PanelHeader>
      <div className="p-[18px]">
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Carnet</Label>
            <select aria-label="Carnet" className={selectClass} value={carnetId} onChange={(e) => onSelectCarnet(e.target.value)}>
              <option value="">— Choisir un carnet actif —</option>
              {(carnets ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.libelle || `Carnet ${c.numeroDebut}–${c.numeroFin}`} (n° {c.prochainNumero})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label>N° du bon (carnet)</Label>
            <Input
              inputMode="numeric"
              value={numeroManuel}
              onChange={(e) => setNumeroManuel(e.target.value.replace(/\D/g, ''))}
              placeholder={carnet ? String(carnet.prochainNumero) : '1023'}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Montant</Label>
            <Input inputMode="decimal" value={montant} onChange={(e) => setMontant(e.target.value)} placeholder="50000" />
          </div>

          <div className="space-y-1.5">
            <Label>Portefeuille (caisse & devise déduites)</Label>
            <select aria-label="Portefeuille" className={selectClass} value={portefeuilleId} onChange={(e) => setPortefeuilleId(e.target.value)} disabled={!carnet}>
              <option value="">{carnet ? '— Choisir —' : '— Choisissez d\'abord un carnet —'}</option>
              {(portefeuilles ?? [])
                .filter((p) => !carnet || p.caisseSourceId === carnet.caisseId)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} — {p.libelle}
                  </option>
                ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label>Type de bon</Label>
            <select aria-label="Type de bon" className={selectClass} value={typeBonId} onChange={(e) => setTypeBonId(e.target.value)}>
              <option value="">— Choisir —</option>
              {(typeBons ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.libelle}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label>Centre de coût</Label>
            <select aria-label="Centre de coût" className={selectClass} value={costCenterId} onChange={(e) => setCostCenterId(e.target.value)}>
              <option value="">— Choisir —</option>
              {(costCenters ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.libelle}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label>Libellé</Label>
            <Input value={libelle} onChange={(e) => setLibelle(e.target.value)} placeholder="Objet du décaissement…" />
          </div>

          {reqPartenaire && (
            <div className="space-y-1.5">
              <Label>Partenaire</Label>
              <select aria-label="Partenaire" className={selectClass} value={partenaireId} onChange={(e) => setPartenaireId(e.target.value)}>
                <option value="">— Choisir —</option>
                {(partenaires ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.raisonSociale}
                  </option>
                ))}
              </select>
            </div>
          )}

          {reqBl && (
            <div className="space-y-1.5">
              <Label>N° Document</Label>
              <Input value={numeroBl} onChange={(e) => setNumeroBl(e.target.value)} placeholder="BL…" />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Code manutention</Label>
            <Input value={codeManutention} onChange={(e) => setCodeManutention(e.target.value)} placeholder="Code…" />
          </div>

          {reqNumeroClient && (
            <div className="space-y-1.5">
              <Label>N° client</Label>
              <Input value={numeroClient} onChange={(e) => setNumeroClient(e.target.value)} placeholder="N° client…" />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Description (optionnel)</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Note…" />
          </div>
        </div>

        {/* Donneur d'ordre · Bénéficiaire · Motif */}
        <div className="mt-3 grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Donneur d'ordre</Label>
            <div className="mb-2 flex gap-1.5">
              <button
                type="button"
                onClick={() => setOrdreMode('user')}
                className={`rounded-[7px] px-2.5 py-1 text-[11px] font-medium ${ordreMode === 'user' ? 'bg-[#0F4C81] text-white' : 'border border-[rgba(15,76,129,0.1)] bg-white text-[#475569]'}`}
              >
                Utilisateur
              </button>
              <button
                type="button"
                onClick={() => setOrdreMode('nom')}
                className={`rounded-[7px] px-2.5 py-1 text-[11px] font-medium ${ordreMode === 'nom' ? 'bg-[#0F4C81] text-white' : 'border border-[rgba(15,76,129,0.1)] bg-white text-[#475569]'}`}
              >
                Nom libre
              </button>
            </div>
            {ordreMode === 'user' ? (
              <select aria-label="Donneur d'ordre" className={selectClass} value={donneurUserId} onChange={(e) => setDonneurUserId(e.target.value)}>
                <option value="">— Choisir —</option>
                {(users ?? []).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.prenom} {u.nom}
                  </option>
                ))}
              </select>
            ) : (
              <Input value={donneurNom} onChange={(e) => setDonneurNom(e.target.value)} placeholder="Nom du donneur d'ordre…" />
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Bénéficiaire (qui retire)</Label>
            <Input value={beneficiaireNom} onChange={(e) => setBeneficiaireNom(e.target.value)} placeholder="Nom…" />
          </div>

          <div className="space-y-1.5">
            <Label>Motif (optionnel)</Label>
            <Input value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Ordre de…" />
          </div>
        </div>

        {create.isError && <p className="mt-3 text-sm text-destructive">{apiErrorMessage(create.error, 'Création impossible')}</p>}

        <Button disabled={!canSubmit} onClick={submit} className="mt-4 w-full bg-[#00C896] text-white hover:bg-[#047857]">
          Décaisser le bon manuel
        </Button>
      </div>
    </Panel>
  );
}
