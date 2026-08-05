import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueries } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { AlertTriangle, ArrowLeft, CheckCircle2, Plus, Trash2, Wallet, X } from 'lucide-react';
import { useCreateBon, useMyBonPerimeter } from '@/api/bons';
import { useTypeBons, usePays, useDivisions, listPartenaires, listNaturesOperation } from '@/api/referentiel';
import { useDevises, getPortefeuilleSolde } from '@/api/financierRef';
import { SapCheckButton, SapCommandeVerify } from '@/components/sap/SapVerify';
import { ClientSelect } from '@/components/ClientSelect';
import { verifierCommandeSap } from '@/api/sap';
import { useAuthStore } from '@/stores/auth.store';
import { apiErrorMessage, cn, formatMontant, NUMERO_CLIENT_REGEX } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RemoteSearchableSelect, type SelectOption } from '@/components/ui/searchable-select';
import type { NatureOperation, Partenaire, Portefeuille } from '@/types/api';

const selectClass =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

const montantRegex = /^\d+(\.\d{1,4})?$/;

const sousBonSchema = z.object({
  // Libellé requis sauf pour les types « nom client » (ex. restitution) — cf. superRefine.
  libelle: z.string().optional(),
  montant: z.string().regex(montantRegex, 'Montant invalide'),
  natureOperationId: z.string().trim().min(1, 'Requis'),
  nomClient: z.string().optional(),
  paysId: z.string().optional(),
  divisionId: z.string().optional(),
  // Partenaire / N° document / N° client : exigés ou non selon le TYPE de bon
  // (flags requiertPartenaire / requiertBl / requiertNumeroClient). Validation
  // conditionnelle ajoutée dynamiquement dans le composant (superRefine).
  partenaireId: z.string().optional(),
  numeroBl: z.string().optional(),
  codeManutention: z.string().trim().min(1, 'Requis'),
  costCenterId: z.string().trim().min(1, 'Requis'),
  // Caisse et devise sont dérivées automatiquement du portefeuille choisi (cf. useEffect).
  caisseId: z.string().trim().min(1, 'Requis'),
  portefeuilleId: z.string().trim().min(1, 'Requis'),
  deviseId: z.string().trim().min(1, 'Requis'),
  // Identifiant SAP (KUNNR) : chiffres uniquement (règle appliquée aussi côté serveur).
  numeroClient: z.string().regex(NUMERO_CLIENT_REGEX, 'Chiffres uniquement').optional(),
  description: z.string().optional(),
});

const schema = z.object({
  typeBonId: z.string().trim().min(1, 'Requis'),
  estRecurrent: z.boolean().optional(),
  frequenceRecurrence: z.enum(['MENSUEL', 'TRIMESTRIEL', 'SEMESTRIEL', 'ANNUEL']).optional(),
  porteur: z.string().optional(),
  soubons: z.array(sousBonSchema).min(1, 'Au moins un sous-bon'),
});

type FormValues = z.infer<typeof schema>;

const emptySousBon = {
  libelle: '',
  montant: '',
  partenaireId: '',
  numeroBl: '',
  codeManutention: '',
  costCenterId: '',
  natureOperationId: '',
  caisseId: '',
  portefeuilleId: '',
  deviseId: '',
  numeroClient: '',
  nomClient: '',
  paysId: '',
  divisionId: '',
  description: '',
};

export function BonCreatePage() {
  const navigate = useNavigate();
  const createBon = useCreateBon();
  const user = useAuthStore((s) => s.user);

  const { data: typeBons } = useTypeBons();
  const { data: paysList } = usePays();
  const { data: allDivisions } = useDivisions();
  // Tout le périmètre de création (CC, caisses, portefeuilles autorisés) vient du serveur.
  const { data: perimeter } = useMyBonPerimeter();
  // Natures d'opération = celles autorisées à l'utilisateur (déjà filtrées côté serveur).
  const naturesOperation = perimeter?.naturesOperation;
  const costCenters = perimeter?.costCenters;
  const portefeuilles = perimeter?.portefeuilles;
  const { data: devises } = useDevises();

  // Recherche EN BASE (pas de filtre JS) pour les listes volumineuses.
  const fetchPartenaires = (q: string): Promise<SelectOption[]> =>
    listPartenaires({ search: q || undefined, limit: 30 }).then((ps) =>
      ps.map((p) => ({
        value: String(p.id),
        label: p.raisonSociale,
        hint: p.numeroFournisseur ? undefined : '⚠ pas de n° SAP',
        data: p,
      })),
    );
  const fetchNatures = (q: string): Promise<SelectOption[]> =>
    listNaturesOperation({ search: q || undefined, limit: 30 }).then((ns) =>
      ns.map((n) => {
        const num = n.natureComptable?.codeComptableSap ?? '';
        const extra = num && num !== n.code ? `  ·  ${num}` : '';
        return { value: String(n.id), label: `${n.code} — ${n.libelle}${extra}`, data: n };
      }),
    );

  // Mémo des éléments sélectionnés (libellé + méta), pour affichage et contrôles
  // sans recharger toute la liste.
  const [partMeta, setPartMeta] = useState<Record<string, { label: string; numeroFournisseur?: string | null }>>({});
  const [natMeta, setNatMeta] = useState<Record<string, { label: string; compteFull?: string; compteNum?: string }>>({});

  // Parmi les portefeuilles du périmètre, on met en avant ceux que l'utilisateur possède
  // (propriétaire direct ou via sa direction) pour la pré-sélection et le groupe « Mes portefeuilles ».
  const userPortefeuilles = useMemo<Portefeuille[]>(() => {
    if (!user || !portefeuilles) return [];
    return portefeuilles.filter(
      (p) =>
        (p.proprietaireType === 'USER' && p.proprietaireId === user.id) ||
        (p.proprietaireType === 'DIRECTION' && p.proprietaireId === user.directionId),
    );
  }, [portefeuilles, user]);

  const defaultPortefeuille = userPortefeuilles[0];

  // Flags du type sélectionné, lus à la validation (resolver stable + ref).
  const flagsRef = useRef({ reqPartenaire: false, reqBl: false, reqNumeroClient: false, reqNomClient: false });
  const resolver = useMemo(
    () =>
      zodResolver(
        schema.superRefine((val, ctx) => {
          const f = flagsRef.current;
          val.soubons.forEach((sb, i) => {
            // Libellé requis sauf pour les types « nom client » (restitution).
            if (!f.reqNomClient && !sb.libelle?.trim())
              ctx.addIssue({ code: 'custom', path: ['soubons', i, 'libelle'], message: 'Requis' });
            if (f.reqNomClient && !sb.nomClient?.trim())
              ctx.addIssue({ code: 'custom', path: ['soubons', i, 'nomClient'], message: 'Requis' });
            if (f.reqNomClient && !sb.paysId)
              ctx.addIssue({ code: 'custom', path: ['soubons', i, 'paysId'], message: 'Requis' });
            if (f.reqNomClient && !sb.divisionId)
              ctx.addIssue({ code: 'custom', path: ['soubons', i, 'divisionId'], message: 'Requis' });
            if (f.reqPartenaire && !sb.partenaireId)
              ctx.addIssue({ code: 'custom', path: ['soubons', i, 'partenaireId'], message: 'Requis' });
            if (f.reqBl && !sb.numeroBl?.trim())
              ctx.addIssue({ code: 'custom', path: ['soubons', i, 'numeroBl'], message: 'Requis' });
            if (f.reqNumeroClient && !sb.numeroClient?.trim())
              ctx.addIssue({ code: 'custom', path: ['soubons', i, 'numeroClient'], message: 'Requis' });
          });
        }),
      ),
    [],
  );

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver,
    defaultValues: { typeBonId: '', estRecurrent: false, soubons: [{ ...emptySousBon }] },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'soubons' });
  const estRecurrent = watch('estRecurrent');
  // Abonnement réactif dédié (plus fiable que watch() pour un field array) : la
  // simulation par portefeuille se recalcule dès qu'un montant ou un portefeuille change.
  const watchSoubons = useWatch({ control, name: 'soubons' });

  // Type sélectionné → champs conditionnels (partenaire / N° document / N° client).
  const selectedTypeBon = typeBons?.find((t) => t.id === watch('typeBonId'));
  const reqPartenaire = selectedTypeBon?.requiertPartenaire ?? false;
  const reqBl = selectedTypeBon?.requiertBl ?? false;
  const reqNumeroClient = selectedTypeBon?.requiertNumeroClient ?? false;
  const reqNomClient = selectedTypeBon?.requiertNomClient ?? false;
  flagsRef.current = { reqPartenaire, reqBl, reqNumeroClient, reqNomClient };

  // Montant demandé agrégé PAR PORTEFEUILLE réellement choisi dans les sous-bons.
  const demandeParPortefeuille = useMemo(() => {
    const map = new Map<string, number>();
    for (const sb of watchSoubons ?? []) {
      if (!sb.portefeuilleId) continue;
      const n = Number(sb.montant);
      if (!Number.isFinite(n) || n <= 0) continue;
      map.set(sb.portefeuilleId, (map.get(sb.portefeuilleId) ?? 0) + n);
    }
    return map;
  }, [watchSoubons]);

  const totalBon = useMemo(
    () =>
      (watchSoubons ?? []).reduce((acc, sb) => {
        const n = Number(sb.montant);
        return Number.isFinite(n) ? acc + n : acc;
      }, 0),
    [watchSoubons],
  );

  // Solde de CHAQUE portefeuille utilisé (une requête par portefeuille distinct).
  const usedPortefeuilleIds = useMemo(
    () => Array.from(demandeParPortefeuille.keys()),
    [demandeParPortefeuille],
  );
  const soldeQueries = useQueries({
    queries: usedPortefeuilleIds.map((id) => ({
      queryKey: ['portefeuille', id, 'solde'],
      queryFn: () => getPortefeuilleSolde(id),
      enabled: !!id,
    })),
  });
  const portefeuilleById = useMemo(
    () => new Map((portefeuilles ?? []).map((p) => [p.id, p])),
    [portefeuilles],
  );

  // Ligne de simulation par portefeuille : solde réel, montant demandé, reste.
  const simulation = usedPortefeuilleIds.map((id, i) => {
    const demande = demandeParPortefeuille.get(id) ?? 0;
    const solde = Number(soldeQueries[i]?.data?.solde ?? 0);
    return { id, pf: portefeuilleById.get(id), demande, solde, reste: solde - demande };
  });
  const depassementTotal = simulation.reduce((acc, s) => acc + Math.max(0, s.demande - s.solde), 0);
  const isInsufficient = simulation.some((s) => s.demande > 0 && s.reste < 0);

  // Modal de demande d'extension
  const [extensionOpen, setExtensionOpen] = useState(false);
  const [extensionDescription, setExtensionDescription] = useState('');
  const [pendingValues, setPendingValues] = useState<FormValues | null>(null);

  // Centre de coût « du portefeuille » : si le portefeuille appartient à une direction,
  // on prend le CC de cette direction présent dans le périmètre ; sinon le 1er CC du périmètre.
  const pickDefaultCc = (ptf?: Portefeuille): string => {
    const ccs = costCenters ?? [];
    if (ptf?.proprietaireType === 'DIRECTION') {
      const match = ccs.find((c) => String(c.directionId) === String(ptf.proprietaireId));
      if (match) return match.id;
    }
    return ccs[0]?.id ?? '';
  };

  // Pré-sélection des champs portefeuille/devise/caisse/centre de coût dès le chargement des références.
  useEffect(() => {
    if (!defaultPortefeuille) return;
    const defaultCc = pickDefaultCc(defaultPortefeuille);
    watchSoubons?.forEach((sb, idx) => {
      if (!sb.portefeuilleId) {
        setValue(`soubons.${idx}.portefeuilleId`, defaultPortefeuille.id, { shouldValidate: false });
      }
      if (!sb.deviseId) {
        setValue(`soubons.${idx}.deviseId`, defaultPortefeuille.deviseId, { shouldValidate: false });
      }
      if (!sb.caisseId) {
        setValue(`soubons.${idx}.caisseId`, defaultPortefeuille.caisseSourceId, { shouldValidate: false });
      }
      if (!sb.costCenterId && defaultCc) {
        setValue(`soubons.${idx}.costCenterId`, defaultCc, { shouldValidate: false });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultPortefeuille, fields.length, costCenters]);

  const submitBon = (values: FormValues, extension?: { description?: string }) => {
    createBon.mutate(
      {
        typeBonId: values.typeBonId,
        estRecurrent: values.estRecurrent,
        frequenceRecurrence: values.estRecurrent ? values.frequenceRecurrence : undefined,
        porteur: values.porteur?.trim() || undefined,
        demandeExtension: extension != null,
        descriptionExtension: extension?.description || undefined,
        soubons: values.soubons.map((sb) => ({
          ...sb,
          // Libellé/N° document non requis pour certains types → valeur par défaut.
          libelle: sb.libelle ?? '',
          numeroBl: sb.numeroBl ?? '',
          // Évite d'envoyer une chaîne vide pour les FK / champs optionnels
          partenaireId: sb.partenaireId || undefined,
          natureOperationId: sb.natureOperationId || undefined,
          numeroClient: sb.numeroClient || undefined,
          nomClient: sb.nomClient || undefined,
          paysId: sb.paysId || undefined,
          divisionId: sb.divisionId || undefined,
          description: sb.description || undefined,
        })),
      },
      { onSuccess: (bon) => navigate({ to: '/bons/$bonId', params: { bonId: bon.id } }) },
    );
  };

  // Contrôle SAP BLOQUANT : si le type exige un n° client / n° commande, on vérifie
  // dans SAP avant de laisser créer le bon. Un code introuvable bloque la création.
  // SAP injoignable n'empêche pas (on ne fige pas la saisie sur une panne SAP).
  const [sapCheck, setSapCheck] = useState<{ checking: boolean; error: string | null }>({ checking: false, error: null });

  // Déverrouillage par sous-bon : si le type exige une vérif SAP (n° client ou n°
  // commande), la suite du sous-bon reste grisée tant que SAP n'a pas CONFIRMÉ
  // l'existence. Clé = field.id (stable même après suppression d'un sous-bon).
  const gateActive = reqBl || reqNumeroClient;
  const [sapGate, setSapGate] = useState<Record<string, { client?: boolean; commande?: boolean }>>({});
  const setGate = (fid: string, key: 'client' | 'commande', ok: boolean) =>
    setSapGate((s) => ({ ...s, [fid]: { ...s[fid], [key]: ok } }));
  const resetGate = (fid: string, key: 'client' | 'commande') =>
    setSapGate((s) => (s[fid]?.[key] === undefined ? s : { ...s, [fid]: { ...s[fid], [key]: undefined } }));
  const isUnlocked = (fid: string) => {
    if (!gateActive) return true;
    const st = sapGate[fid] ?? {};
    return (reqNumeroClient ? st.client === true : true) && (reqBl ? st.commande === true : true);
  };

  const verifierSapAvantEnvoi = async (values: FormValues): Promise<string | null> => {
    for (let i = 0; i < values.soubons.length; i++) {
      const sb = values.soubons[i];
      if (reqNumeroClient && sb.numeroClient?.trim()) {
        // Contrôle dans le RÉFÉRENTIEL LOCAL (clients importés de SAP) : plus
        // besoin d'un aller-retour SAP, et le bon reste créable si la liaison
        // est coupée. Le référentiel se met à jour via Master Data → Clients.
        try {
          const num = sb.numeroClient.trim();
          const trouves = await listPartenaires({ type: 'CLIENT', search: num, limit: 30 });
          if (!trouves.some((c) => String(c.numeroClient) === num)) {
            return `Sous-bon ${i + 1} : le client « ${num} » est introuvable dans le référentiel. Synchronisez les clients depuis SAP (Master Data → Clients).`;
          }
        } catch {
          /* Référentiel injoignable : on laisse passer, le serveur revalidera */
        }
      }
      if (reqBl && sb.numeroBl?.trim()) {
        try {
          const r = await verifierCommandeSap(sb.numeroBl.trim());
          if (!r.existe) return `Sous-bon ${i + 1} : la commande « ${sb.numeroBl} » n'existe pas dans SAP.`;
        } catch {
          /* SAP injoignable : on laisse passer */
        }
      }
    }
    return null;
  };

  const onSubmit = handleSubmit(async (values) => {
    // 0) Si le type exige un partenaire, il doit avoir un N° fournisseur SAP valide.
    if (reqPartenaire) {
      for (let i = 0; i < values.soubons.length; i++) {
        const pid = values.soubons[i].partenaireId;
        const part = pid ? partMeta[pid] : null;
        if (!part?.numeroFournisseur) {
          setSapCheck({
            checking: false,
            error: `Sous-bon ${i + 1} : le fournisseur choisi n'a pas de N° fournisseur SAP. Renseigne-le dans Partenaires d'abord.`,
          });
          return;
        }
      }
    }

    // 1) Vérification SAP bloquante des champs requis.
    setSapCheck({ checking: true, error: null });
    const sapErr = await verifierSapAvantEnvoi(values);
    setSapCheck({ checking: false, error: sapErr });
    if (sapErr) return;

    // 2) Si le total dépasse le solde du portefeuille principal, on propose l'extension.
    if (isInsufficient) {
      setPendingValues(values);
      setExtensionDescription('');
      setExtensionOpen(true);
      return;
    }
    submitBon(values);
  });

  const handleConfirmExtension = () => {
    if (!pendingValues) return;
    const desc = extensionDescription.trim();
    submitBon(pendingValues, { description: desc });
    setExtensionOpen(false);
  };

  const handleCancelExtension = () => {
    setExtensionOpen(false);
    setPendingValues(null);
  };

  return (
    <div className="space-y-4">
      <Link to="/bons" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Retour aux bons
      </Link>

      <h1 className="text-2xl font-semibold">Nouveau bon</h1>

      {perimeter && (naturesOperation?.length ?? 0) === 0 && (
        <div className="rounded-[10px] border border-[#FED7AA] bg-[#FFF7ED] px-4 py-3 text-sm text-[#9A3412]">
          Aucune nature comptable ne vous est autorisée — vous ne pouvez pas créer de bon.
          Demandez à un administrateur de vous en affecter (page Utilisateurs).
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <form onSubmit={onSubmit} className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">En-tête</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="typeBonId">Type de bon</Label>
              <select id="typeBonId" className={selectClass} {...register('typeBonId')}>
                <option value="">— Choisir —</option>
                {typeBons?.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.libelle}
                  </option>
                ))}
              </select>
              {errors.typeBonId && <p className="text-sm text-destructive">{errors.typeBonId.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>Récurrence</Label>
              <label className="flex h-10 items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4" {...register('estRecurrent')} />
                Bon récurrent
              </label>
            </div>
            {estRecurrent && (
              <div className="space-y-2">
                <Label htmlFor="frequenceRecurrence">Fréquence</Label>
                <select id="frequenceRecurrence" className={selectClass} {...register('frequenceRecurrence')}>
                  <option value="">— Choisir —</option>
                  <option value="MENSUEL">Mensuel</option>
                  <option value="TRIMESTRIEL">Trimestriel</option>
                  <option value="SEMESTRIEL">Semestriel</option>
                  <option value="ANNUEL">Annuel</option>
                </select>
              </div>
            )}
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="porteur">
                Porteur <span className="text-muted-foreground">(optionnel)</span>
              </Label>
              <Input
                id="porteur"
                placeholder="Personne qui se présentera à la caisse pour le retrait…"
                {...register('porteur')}
              />
              <p className="text-xs text-muted-foreground">
                Laissez vide si inconnu — pourra être renseigné lors de la validation.
              </p>
            </div>
          </CardContent>
        </Card>

        {fields.map((field, index) => {
          const fid = field.id;
          const unlocked = isUnlocked(fid);
          return (
          <Card key={field.id}>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Sous-bon {index + 1}</CardTitle>
              {fields.length > 1 && (
                <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              )}
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              {/* ---- Vérification SAP requise : À FAIRE EN PREMIER, déverrouille la suite ---- */}
              {gateActive && (
                <div className="space-y-3 rounded-[10px] border border-[#BFDBFE] bg-[#F0F7FF] p-3.5 sm:col-span-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.6px] text-[#1E40AF]">
                    Vérification SAP requise
                  </p>
                  {reqNumeroClient && (
                    <div className="space-y-1.5">
                      <Label>Client</Label>
                      {/* Recherche dans la base locale (clients importés de SAP), et
                          non par appel SAP : instantané, fonctionne même si la
                          liaison SAP est coupée, et le numéro ne peut pas être
                          erroné puisqu'il est choisi et non saisi. */}
                      <ClientSelect
                        value={watch(`soubons.${index}.numeroClient`) ?? ''}
                        onChange={(numero, raisonSociale) => {
                          setValue(`soubons.${index}.numeroClient`, numero, { shouldValidate: true });
                          if (raisonSociale) {
                            setValue(`soubons.${index}.nomClient`, raisonSociale, { shouldValidate: true });
                          }
                          // Choisi dans le référentiel = existence acquise :
                          // le verrou de vérification se lève tout seul.
                          if (numero) setGate(fid, 'client', true);
                          else resetGate(fid, 'client');
                        }}
                      />
                      {errors.soubons?.[index]?.numeroClient && (
                        <p className="text-sm text-destructive">{errors.soubons[index]?.numeroClient?.message}</p>
                      )}
                    </div>
                  )}
                  {reqBl && (
                    <div className="space-y-1.5">
                      <Label>N° Document (commande)</Label>
                      <div className="flex items-start gap-2">
                        <div className="flex-1">
                          <Input {...register(`soubons.${index}.numeroBl`, { onChange: () => resetGate(fid, 'commande') })} />
                        </div>
                        <SapCheckButton
                          kind="commande"
                          value={watch(`soubons.${index}.numeroBl`) ?? ''}
                          onResult={(existe) => setGate(fid, 'commande', existe)}
                        />
                      </div>
                      {errors.soubons?.[index]?.numeroBl && (
                        <p className="text-sm text-destructive">{errors.soubons[index]?.numeroBl?.message}</p>
                      )}
                    </div>
                  )}
                  <p className={cn('text-[11px]', unlocked ? 'text-[#047857]' : 'text-[#64748B]')}>
                    {unlocked
                      ? '✓ Vérifié dans SAP — vous pouvez compléter le sous-bon.'
                      : 'Vérifiez le(s) numéro(s) dans SAP pour débloquer la saisie ci-dessous.'}
                  </p>
                </div>
              )}

              {/* ---- Reste du sous-bon : grisé tant que la vérification SAP n'est pas confirmée ---- */}
              <fieldset disabled={!unlocked} className="contents">
              {!reqNomClient && (
                <div className="space-y-2 sm:col-span-2">
                  <Label>Libellé</Label>
                  <Input {...register(`soubons.${index}.libelle`)} />
                  {errors.soubons?.[index]?.libelle && (
                    <p className="text-sm text-destructive">{errors.soubons[index]?.libelle?.message}</p>
                  )}
                </div>
              )}
              {reqNomClient && (
                <div className="space-y-2">
                  <Label>Nom client</Label>
                  <Input {...register(`soubons.${index}.nomClient`)} />
                  {errors.soubons?.[index]?.nomClient && (
                    <p className="text-sm text-destructive">{errors.soubons[index]?.nomClient?.message}</p>
                  )}
                </div>
              )}
              {reqNomClient && (
                <div className="space-y-2">
                  <Label>Pays</Label>
                  <select
                    className={selectClass}
                    {...register(`soubons.${index}.paysId`, {
                      onChange: () => setValue(`soubons.${index}.divisionId`, '', { shouldValidate: false }),
                    })}
                  >
                    <option value="">— Choisir —</option>
                    {paysList?.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code} — {p.libelle}
                      </option>
                    ))}
                  </select>
                  {errors.soubons?.[index]?.paysId && (
                    <p className="text-sm text-destructive">{errors.soubons[index]?.paysId?.message}</p>
                  )}
                </div>
              )}
              {reqNomClient && (
                <div className="space-y-2">
                  <Label>Division</Label>
                  <select
                    className={selectClass}
                    disabled={!watch(`soubons.${index}.paysId`)}
                    {...register(`soubons.${index}.divisionId`)}
                  >
                    <option value="">— Choisir —</option>
                    {(allDivisions ?? [])
                      .filter((d) => d.paysId === watch(`soubons.${index}.paysId`))
                      .map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.code} — {d.libelle}
                        </option>
                      ))}
                  </select>
                  {errors.soubons?.[index]?.divisionId && (
                    <p className="text-sm text-destructive">{errors.soubons[index]?.divisionId?.message}</p>
                  )}
                </div>
              )}
              <div className="space-y-2">
                <Label>Montant</Label>
                <Input inputMode="decimal" {...register(`soubons.${index}.montant`)} />
                {errors.soubons?.[index]?.montant && (
                  <p className="text-sm text-destructive">{errors.soubons[index]?.montant?.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Portefeuille</Label>
                <select
                  className={selectClass}
                  {...register(`soubons.${index}.portefeuilleId`, {
                    onChange: (e) => {
                      // Sync devise + caisse + centre de coût sur ceux du portefeuille choisi.
                      const ptf = portefeuilles?.find((p) => p.id === e.target.value);
                      setValue(`soubons.${index}.deviseId`, ptf?.deviseId ?? '', { shouldValidate: true });
                      setValue(`soubons.${index}.caisseId`, ptf?.caisseSourceId ?? '', { shouldValidate: true });
                      setValue(`soubons.${index}.costCenterId`, pickDefaultCc(ptf), { shouldValidate: true });
                    },
                  })}
                >
                  <option value="">— Choisir —</option>
                  {userPortefeuilles.length > 0 && (
                    <optgroup label="Mes portefeuilles">
                      {userPortefeuilles.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.code} — {p.libelle}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {portefeuilles && portefeuilles.length > userPortefeuilles.length && (
                    <optgroup label="Autres portefeuilles">
                      {portefeuilles
                        .filter((p) => !userPortefeuilles.some((up) => up.id === p.id))
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.code} — {p.libelle}
                          </option>
                        ))}
                    </optgroup>
                  )}
                </select>
              </div>
              {/* Devise : dérivée automatiquement du portefeuille, affichée en lecture seule */}
              <div className="space-y-2">
                <Label>Devise</Label>
                {(() => {
                  const deviseId = watch(`soubons.${index}.deviseId`);
                  const dev = devises?.find((d) => d.id === deviseId);
                  return (
                    <div className="flex h-10 items-center rounded-md border border-input bg-[#F8FAFC] px-3 text-sm text-[#0F172A]">
                      {dev ? `${dev.code}${dev.libelle ? ` — ${dev.libelle}` : ''}` : '—'}
                    </div>
                  );
                })()}
                {/* Champ caché pour conserver la valeur dans le formulaire */}
                <input type="hidden" {...register(`soubons.${index}.deviseId`)} />
              </div>
              {/* Caisse : choisie automatiquement en arrière, complètement masquée */}
              <input type="hidden" {...register(`soubons.${index}.caisseId`)} />
              {reqPartenaire && (
                <div className="space-y-2">
                  <Label>Partenaire</Label>
                  <RemoteSearchableSelect
                    value={watch(`soubons.${index}.partenaireId`) ?? ''}
                    selectedLabel={partMeta[watch(`soubons.${index}.partenaireId`) ?? '']?.label}
                    onChange={(v, opt) => {
                      setValue(`soubons.${index}.partenaireId`, v, { shouldValidate: true });
                      const p = opt?.data as Partenaire | undefined;
                      if (p) setPartMeta((m) => ({ ...m, [v]: { label: p.raisonSociale, numeroFournisseur: p.numeroFournisseur } }));
                    }}
                    fetcher={fetchPartenaires}
                    queryKey="bon-partenaire"
                    placeholder="— Choisir un partenaire —"
                  />
                  {errors.soubons?.[index]?.partenaireId && (
                    <p className="text-sm text-destructive">{errors.soubons[index]?.partenaireId?.message}</p>
                  )}
                  {(() => {
                    const pid = watch(`soubons.${index}.partenaireId`);
                    const part = pid ? partMeta[pid] : null;
                    if (!part) return null;
                    return part.numeroFournisseur ? (
                      <p className="text-[11px] text-muted-foreground">
                        Fournisseur SAP : <span className="font-mono text-[#0F172A]">{part.numeroFournisseur}</span>
                      </p>
                    ) : (
                      <p className="text-[11px] text-[#B45309]">
                        ⚠ Ce fournisseur n'a pas de N° fournisseur SAP — renseigne-le dans Partenaires pour créer le bon.
                      </p>
                    );
                  })()}
                </div>
              )}
              <div className="space-y-2">
                <Label>Centre de coût</Label>
                <select className={selectClass} {...register(`soubons.${index}.costCenterId`)}>
                  <option value="">— Choisir —</option>
                  {costCenters?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} — {c.libelle}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Nature comptable</Label>
                <RemoteSearchableSelect
                  value={watch(`soubons.${index}.natureOperationId`) ?? ''}
                  selectedLabel={natMeta[watch(`soubons.${index}.natureOperationId`) ?? '']?.label}
                  onChange={(v, opt) => {
                    setValue(`soubons.${index}.natureOperationId`, v, { shouldValidate: true });
                    const n = opt?.data as NatureOperation | undefined;
                    if (n)
                      setNatMeta((m) => ({
                        ...m,
                        [v]: {
                          label: `${n.code} — ${n.libelle}`,
                          compteNum: n.natureComptable?.codeComptableSap ?? undefined,
                          compteFull: n.natureComptable?.codeComptableSap
                            ? `${n.natureComptable.codeComptableSap} — ${n.natureComptable.libelle}`
                            : undefined,
                        },
                      }));
                  }}
                  fetcher={fetchNatures}
                  queryKey="bon-nature"
                  placeholder="— Choisir une nature —"
                />
                {(() => {
                  const nid = watch(`soubons.${index}.natureOperationId`);
                  const nm = nid ? natMeta[nid] : null;
                  if (!nid) return null;
                  return (
                    <p className="text-[11px] text-muted-foreground">
                      {nm?.compteFull ? (
                        <>Compte PCGG : <span className="font-mono text-[#0F172A]">{nm.compteFull}</span></>
                      ) : (
                        <span className="text-[#B45309]">Aucun compte PCGG rattaché à cette nature.</span>
                      )}
                    </p>
                  );
                })()}
                {perimeter && naturesOperation && naturesOperation.length === 0 && (
                  <p className="text-sm text-destructive">
                    Aucune nature comptable ne vous est autorisée. Contactez un administrateur.
                  </p>
                )}
                {errors.soubons?.[index]?.natureOperationId && (
                  <p className="text-sm text-destructive">
                    {errors.soubons[index]?.natureOperationId?.message}
                  </p>
                )}
              </div>
              {/* N° Document optionnel : uniquement si le type NE l'exige PAS (sinon il est dans le bloc SAP en tête). */}
              {!reqBl && (
                <div className="space-y-2">
                  <Label>
                    N° Document <span className="text-xs font-normal text-muted-foreground">(optionnel)</span>
                  </Label>
                  <Input {...register(`soubons.${index}.numeroBl`)} />
                  {errors.soubons?.[index]?.numeroBl && (
                    <p className="text-sm text-destructive">{errors.soubons[index]?.numeroBl?.message}</p>
                  )}
                  <SapCommandeVerify numero={watch(`soubons.${index}.numeroBl`) ?? ''} />
                </div>
              )}
              <div className="space-y-2">
                <Label>Code manutention</Label>
                <Input {...register(`soubons.${index}.codeManutention`)} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Description (optionnel)</Label>
                <Input {...register(`soubons.${index}.description`)} />
              </div>
              </fieldset>
            </CardContent>
          </Card>
          );
        })}

        {perimeter && !perimeter.isAdmin && !perimeter.hasMultiCc && fields.length > 1 && (
          <p className="flex items-start gap-1.5 text-xs text-[#92400E]">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Tous les sous-bons doivent porter sur le même centre de coût (permission BON_MULTI_CC
            requise pour en mélanger plusieurs).
          </p>
        )}

        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={() => append({ ...emptySousBon })}>
            <Plus className="h-4 w-4" /> Ajouter un sous-bon
          </Button>
          <Button
            type="submit"
            disabled={createBon.isPending || sapCheck.checking || !fields.every((f) => isUnlocked(f.id))}
          >
            {sapCheck.checking
              ? 'Vérification SAP…'
              : createBon.isPending
                ? 'Création…'
                : isInsufficient
                  ? 'Créer & demander extension'
                  : 'Créer le bon'}
          </Button>
          {gateActive && !fields.every((f) => isUnlocked(f.id)) && (
            <p className="text-sm text-[#B45309]">Vérifiez d'abord les numéros dans SAP pour débloquer la création.</p>
          )}
          {sapCheck.error && <p className="text-sm text-destructive">{sapCheck.error}</p>}
          {createBon.isError && (
            <p className="text-sm text-destructive">{apiErrorMessage(createBon.error, 'Création impossible')}</p>
          )}
        </div>
      </form>

      {/* Panneau latéral : solde du portefeuille */}
      <aside className="space-y-4">
        <div
          className={cn(
            'sticky top-4 overflow-hidden rounded-[14px] border bg-white',
            isInsufficient
              ? 'border-[#FECDCA] shadow-[0_4px_12px_rgba(240,68,56,0.12)]'
              : 'border-[rgba(15,76,129,0.1)]',
          )}
        >
          <div className="flex items-center gap-2.5 border-b border-[rgba(15,76,129,0.08)] bg-[#F8FAFC] px-4 py-3">
            <div
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-[10px]',
                isInsufficient ? 'bg-[#FEF3F2] text-[#B42318]' : 'bg-[#EFF6FF] text-[#1A6DB5]',
              )}
            >
              <Wallet className="h-4 w-4" />
            </div>
            <div>
              <div className="font-display text-[13px] font-semibold text-[#0F172A]">
                Solde par portefeuille
              </div>
              <div className="text-[11px] text-[#64748B]">
                Impact de ce bon, portefeuille par portefeuille
              </div>
            </div>
          </div>

          <div className="space-y-3 p-4">
            {simulation.length === 0 && (
              <div className="flex items-start gap-2 rounded-[10px] bg-[#F8FAFC] px-3 py-2.5 text-[11px] text-[#64748B]">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#94A3B8]" />
                Choisissez un portefeuille et saisissez les montants pour voir l'impact sur le solde.
              </div>
            )}

            {simulation.map((s) => {
              const insuffisant = s.demande > 0 && s.reste < 0;
              return (
                <div
                  key={s.id}
                  className={cn(
                    'rounded-[10px] border px-3 py-2.5',
                    insuffisant
                      ? 'border-[#FECDCA] bg-[#FEF3F2]'
                      : 'border-[rgba(15,76,129,0.08)] bg-white',
                  )}
                >
                  <div className="mb-1.5 text-[11px] font-semibold text-[#0F172A]">
                    {s.pf ? `${s.pf.code} — ${s.pf.libelle}` : 'Portefeuille'}
                  </div>
                  <div className="flex items-baseline justify-between text-[11px]">
                    <span className="text-[#64748B]">Solde</span>
                    <span className="font-display font-semibold tabular-nums text-[#0F172A]">
                      {formatMontant(s.solde)}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between text-[11px]">
                    <span className="text-[#64748B]">Demandé</span>
                    <span className="font-display font-semibold tabular-nums text-[#0F172A]">
                      {formatMontant(s.demande)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-baseline justify-between border-t border-dashed border-[rgba(15,76,129,0.1)] pt-1.5">
                    <span className="text-[11px] font-medium text-[#0F172A]">Reste après ce bon</span>
                    <span
                      className={cn(
                        'font-display text-[15px] font-semibold tabular-nums',
                        s.reste < 0 ? 'text-[#B42318]' : 'text-[#047857]',
                      )}
                    >
                      {formatMontant(s.reste)}
                    </span>
                  </div>
                  {insuffisant && (
                    <div className="mt-1.5 text-[10px] text-[#B42318]">
                      Manque {formatMontant(Math.abs(s.reste))} sur ce portefeuille.
                    </div>
                  )}
                </div>
              );
            })}

            {isInsufficient && (
              <div className="rounded-[10px] border border-[#FECDCA] bg-[#FEF3F2] px-3 py-2.5 text-[11px] text-[#B42318]">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <div>
                    <div className="font-semibold">Solde insuffisant</div>
                    <div className="mt-0.5 text-[#7F1D1D]">
                      Dépassement total : {formatMontant(depassementTotal)}.
                    </div>
                    <div className="mt-1.5 text-[10px] text-[#7F1D1D]">
                      Une demande d'extension de budget vous sera proposée à la validation.
                    </div>
                  </div>
                </div>
              </div>
            )}
            {simulation.length > 0 && !isInsufficient && (
              <div className="flex items-start gap-2 rounded-[10px] bg-[#ECFDF5] px-3 py-2.5 text-[11px] text-[#047857]">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Chaque portefeuille couvre les montants demandés.
              </div>
            )}
          </div>
        </div>
      </aside>
      </div>

      {/* Modal de demande d'extension */}
      {extensionOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0A1628]/60 px-4"
          onClick={handleCancelExtension}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-[14px] border border-[rgba(15,76,129,0.1)] bg-white shadow-[0_20px_50px_rgba(15,23,42,0.25)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2.5 border-b border-[rgba(15,76,129,0.08)] bg-[#FEF3F2] px-5 py-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-white text-[#B42318]">
                <AlertTriangle className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <div className="font-display text-[14px] font-semibold text-[#0F172A]">
                  Demande d'extension de budget
                </div>
                <div className="text-[11px] text-[#7F1D1D]">
                  Le montant dépasse votre solde disponible.
                </div>
              </div>
              <button
                type="button"
                onClick={handleCancelExtension}
                aria-label="Fermer"
                className="flex h-8 w-8 items-center justify-center rounded-[8px] text-[#94A3B8] hover:bg-white hover:text-[#0F172A]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 p-5">
              <div className="grid grid-cols-2 gap-2 rounded-[10px] bg-[#F8FAFC] px-3 py-2.5 text-[11px]">
                <div>
                  <div className="text-[#64748B]">Montant du bon</div>
                  <div className="font-display font-semibold tabular-nums text-[#0F172A]">
                    {formatMontant(totalBon)}
                  </div>
                </div>
                <div>
                  <div className="text-[#64748B]">Dépassement total</div>
                  <div className="font-display font-semibold tabular-nums text-[#B42318]">
                    {formatMontant(depassementTotal)}
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="extDesc" className="text-xs">
                  Justification <span className="text-[#64748B]">(optionnel)</span>
                </Label>
                <textarea
                  id="extDesc"
                  rows={4}
                  value={extensionDescription}
                  onChange={(e) => setExtensionDescription(e.target.value)}
                  placeholder="Préciser le motif de la demande d'extension (urgence, projet, etc.)…"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-[#1A6DB5] focus:ring-2 focus:ring-[#1A6DB5]/15"
                  maxLength={500}
                />
                <div className="text-right text-[10px] text-[#94A3B8]">
                  {extensionDescription.length}/500
                </div>
              </div>

              <p className="text-[11px] text-[#64748B]">
                Le bon sera créé en statut « En attente » avec un marqueur d'extension visible par
                le validateur.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-[rgba(15,76,129,0.08)] bg-[#F8FAFC] px-5 py-3">
              <Button type="button" variant="outline" onClick={handleCancelExtension}>
                Annuler
              </Button>
              <Button type="button" onClick={handleConfirmExtension} disabled={createBon.isPending}>
                {createBon.isPending ? 'Envoi…' : 'Confirmer la demande'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
