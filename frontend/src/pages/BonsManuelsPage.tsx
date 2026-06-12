import { useMemo, useState } from 'react';
import { BookText, Plus, Wallet } from 'lucide-react';
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
import type { Carnet } from '@/types/api';

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
  const { data: bonsManuels } = useBonsManuels();
  const { data: caisses } = useCaisses();
  const { data: users } = useUsers();
  const { data: portefeuilles } = usePortefeuilles();

  const userById = useMemo(() => new Map((users ?? []).map((u) => [u.id, u])), [users]);
  const caisseById = useMemo(() => new Map((caisses ?? []).map((c) => [c.id, c])), [caisses]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <BookText className="h-5 w-5 text-[#0F4C81]" />
        <h1 className="font-display text-base font-semibold text-[#0F172A]">Bons manuels</h1>
      </div>

      {/* Saisie d'un bon manuel — pleine largeur */}
      <NouveauBonManuel />

      {/* Carnets (liste) + création (admin) */}
      <div className="grid items-start gap-4 lg:grid-cols-[1fr_360px]">
      <Panel>
        <PanelHeader title="Carnets" badge={`${carnets?.length ?? 0}`} />
        <div className="divide-y divide-[rgba(15,76,129,0.06)]">
          {(carnets ?? []).length === 0 && (
            <div className="px-[18px] py-8 text-center text-sm text-[#94A3B8]">Aucun carnet.</div>
          )}
          {(carnets ?? []).map((c) => (
            <CarnetRow key={c.id} carnet={c} caisseLabel={caisseById.get(c.caisseId)?.libelle} isAdmin={isAdmin} />
          ))}
        </div>
      </Panel>
        {isAdmin && <NouveauCarnet />}
      </div>

      {/* Bons manuels récents */}
      <Panel>
        <PanelHeader title="Bons manuels" badge={`${bonsManuels?.length ?? 0}`} />
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-[#F8FAFC] text-left text-[10px] uppercase tracking-[0.7px] text-[#64748B]">
              <tr>
                <th className="px-4 py-2 font-medium">N°</th>
                <th className="px-4 py-2 font-medium">N° carnet</th>
                <th className="px-4 py-2 text-right font-medium">Montant</th>
                <th className="px-4 py-2 font-medium">Donneur d'ordre</th>
                <th className="px-4 py-2 font-medium">Bénéficiaire</th>
                <th className="px-4 py-2 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {(bonsManuels ?? []).map((b) => (
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
              {(bonsManuels ?? []).length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-[#94A3B8]">
                    Aucun bon manuel.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
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

  const montantValid = /^\d+(\.\d{1,4})?$/.test(montant) && Number(montant) > 0;
  const ordreOk = ordreMode === 'user' ? !!donneurUserId : donneurNom.trim().length > 0;
  const canSubmit =
    !!carnetId &&
    numeroManuel !== '' &&
    !!portefeuilleId &&
    montantValid &&
    !!typeBonId &&
    libelle.trim().length > 0 &&
    numeroBl.trim().length > 0 &&
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
        partenaireId: partenaireId || undefined,
        numeroBl: numeroBl.trim(),
        codeManutention: codeManutention.trim(),
        costCenterId,
        numeroClient: numeroClient.trim() || undefined,
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

          <div className="space-y-1.5">
            <Label>Partenaire (optionnel)</Label>
            <select aria-label="Partenaire" className={selectClass} value={partenaireId} onChange={(e) => setPartenaireId(e.target.value)}>
              <option value="">— Aucun —</option>
              {(partenaires ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.raisonSociale}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label>N° BL</Label>
            <Input value={numeroBl} onChange={(e) => setNumeroBl(e.target.value)} placeholder="BL…" />
          </div>

          <div className="space-y-1.5">
            <Label>Code manutention</Label>
            <Input value={codeManutention} onChange={(e) => setCodeManutention(e.target.value)} placeholder="Code…" />
          </div>

          <div className="space-y-1.5">
            <Label>N° client (optionnel)</Label>
            <Input value={numeroClient} onChange={(e) => setNumeroClient(e.target.value)} placeholder="N° client…" />
          </div>

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
