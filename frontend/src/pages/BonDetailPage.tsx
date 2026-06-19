import { useMemo, useState } from 'react';
import { Link, useParams } from '@tanstack/react-router';
import { AxiosError } from 'axios';
import { ArrowLeft, CheckCircle2, Pencil, Printer, X } from 'lucide-react';
import {
  useBon,
  useSousBons,
  useImpression,
  useValidateBon,
  usePrintBon,
  useSignBon,
  useCancelBon,
  useDecaisserBon,
} from '@/api/bons';
import { useBonCaisseByBon } from '@/api/bonsCaisse';
import { useCostCenters, useNaturesOperation } from '@/api/referentiel';
import { useUsers, useUserRoles, useMyPermissions } from '@/api/users';
import { useAuthStore } from '@/stores/auth.store';
import { cn, formatMontant } from '@/lib/utils';
import type { Bon, BonCaisse, SousBon } from '@/types/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatutBadge } from '@/components/StatutBadge';
import { SignaturePad } from '@/components/SignaturePad';
import { PreparationDecaissementModal } from '@/components/PreparationDecaissementModal';
import { EditBonModal } from '@/components/EditBonModal';

function errMessage(error: unknown): string | null {
  if (error instanceof AxiosError) {
    return (error.response?.data as { message?: string })?.message ?? 'Action impossible';
  }
  return null;
}

/** Construit le HTML imprimable du bon et déclenche l'impression dans une nouvelle fenêtre. */
function openPrintWindow(
  bon: Bon,
  soubons: SousBon[],
  imprimePar: string,
  signatureDataUrl: string | null,
) {
  const total = formatMontant(bon.montantTotal);
  const rows = soubons
    .map(
      (sb) => `
      <tr>
        <td>${sb.numeroSousBon}</td>
        <td>${sb.libelle}</td>
        <td>${sb.numeroBl}</td>
        <td>${sb.codeManutention}</td>
        <td class="r">${formatMontant(sb.montant)}</td>
      </tr>`,
    )
    .join('');

  const html = `<!doctype html>
<html lang="fr"><head>
<meta charset="utf-8" />
<title>Bon ${bon.numero}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'Helvetica Neue',Arial,sans-serif;color:#0F172A;padding:32px;font-size:12px;}
  .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #0F4C81;padding-bottom:16px;margin-bottom:20px;}
  .brand{font-weight:700;color:#0F4C81;font-size:18px;}
  .sub{color:#64748B;font-size:11px;margin-top:2px;}
  .meta{text-align:right;font-size:11px;color:#64748B;}
  h1{font-size:22px;color:#0F4C81;margin-bottom:4px;}
  .infos{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:20px 0;}
  .info-label{font-size:10px;text-transform:uppercase;letter-spacing:.7px;color:#64748B;margin-bottom:2px;}
  .info-value{font-size:13px;font-weight:600;}
  table{width:100%;border-collapse:collapse;margin-top:8px;font-size:11px;}
  th{background:#F1F5F9;text-align:left;padding:8px;border-bottom:1px solid #CBD5E1;font-size:10px;text-transform:uppercase;color:#64748B;letter-spacing:.5px;}
  td{padding:8px;border-bottom:1px solid #E2E8F0;}
  .r{text-align:right;}
  .total{margin-top:12px;display:flex;justify-content:flex-end;}
  .total-box{background:#0F4C81;color:#fff;padding:10px 18px;border-radius:6px;font-weight:700;font-size:14px;}
  .sign{margin-top:48px;display:grid;grid-template-columns:1fr 1fr;gap:48px;}
  .sign-box{border-top:1px solid #94A3B8;padding-top:6px;font-size:11px;color:#64748B;}
  .footer{margin-top:32px;text-align:center;color:#94A3B8;font-size:10px;}
  @media print { body { padding:20px; } }
</style>
</head><body>
  <div class="head">
    <div>
      <div class="brand">Fond de Caisse — NPG Gandour</div>
      <div class="sub">Bon de décaissement</div>
    </div>
    <div class="meta">
      Imprimé par : <strong>${imprimePar}</strong><br/>
      Le ${new Date().toLocaleString('fr-FR')}
    </div>
  </div>

  <h1>Bon n° ${bon.numero}</h1>
  <div class="sub">Statut : ${bon.statut}${bon.estRecurrent ? ' · récurrent' : ''}</div>

  <div class="infos">
    <div>
      <div class="info-label">Date de création</div>
      <div class="info-value">${new Date(bon.createdAt).toLocaleString('fr-FR')}</div>
    </div>
    <div>
      <div class="info-label">Nombre de sous-bons</div>
      <div class="info-value">${soubons.length}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr><th>#</th><th>Libellé</th><th>BL</th><th>Manutention</th><th class="r">Montant</th></tr>
    </thead>
    <tbody>${rows || '<tr><td colspan="5" style="text-align:center;color:#94A3B8;padding:20px">Aucun sous-bon</td></tr>'}</tbody>
  </table>

  <div class="total">
    <div class="total-box">Total : ${total}</div>
  </div>

  <div class="sign">
    <div class="sign-box">
      Signature du validateur
      ${signatureDataUrl ? `<img src="${signatureDataUrl}" alt="Signature" style="display:block;margin-top:8px;max-width:220px;max-height:90px" />` : ''}
    </div>
    <div class="sign-box">Signature du caissier</div>
  </div>

  <div class="footer">Document généré par Fond de Caisse — NPG Gandour</div>
  <script>window.addEventListener('load', () => { setTimeout(() => window.print(), 250); });</script>
</body></html>`;

  const w = window.open('', '_blank', 'width=900,height=1000');
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}

export function BonDetailPage() {
  const { bonId } = useParams({ from: '/protected/bons/$bonId' });
  const bonQuery = useBon(bonId);
  const sousBonsQuery = useSousBons(bonId);
  const impressionQuery = useImpression(bonId);
  const { data: usersList } = useUsers();
  const { data: costCenters } = useCostCenters();
  const { data: naturesOperation } = useNaturesOperation();
  const currentUser = useAuthStore((s) => s.user);

  const costCenterById = useMemo(
    () => new Map((costCenters ?? []).map((c) => [String(c.id), c])),
    [costCenters],
  );
  const natureOpById = useMemo(
    () => new Map((naturesOperation ?? []).map((n) => [String(n.id), n])),
    [naturesOperation],
  );

  const validate = useValidateBon(bonId);
  const print = usePrintBon(bonId);
  const sign = useSignBon(bonId);
  const cancel = useCancelBon(bonId);
  const decaisserTout = useDecaisserBon(bonId);

  // BonCaisses rattachés à ce bon — sert à savoir si une préparation (PREPARE)
  // existe déjà pour un sous-bon, et à proposer "Reprendre" au lieu de "Décaisser".
  const bonCaissesQuery = useBonCaisseByBon(bonId);
  const bonCaisses = bonCaissesQuery.data ?? [];
  const preparationBySousBonId = useMemo(() => {
    const map = new Map<string, BonCaisse>();
    for (const bc of bonCaisses) {
      if (bc.statut === 'PREPARE' && bc.sousBonSourceId) {
        map.set(String(bc.sousBonSourceId), bc);
      }
    }
    return map;
  }, [bonCaisses]);

  // Rôle utilisateur pour gating de l'action "Décaisser"
  const { data: roles } = useUserRoles(currentUser?.id ?? null);
  const isAdminRole = (roles ?? []).some((r) => r.code === 'ADMINISTRATEUR' || r.code === 'SUPER_ADMIN');
  const isCaissier = isAdminRole || (roles ?? []).some((r) => r.code === 'CAISSIER');
  const isValidateur = isAdminRole || (roles ?? []).some((r) => r.code === 'VALIDATEUR');

  // Droit de modifier un bon/sous-bon : VALIDATEUR (admins inclus) ou permission BON_MODIFIER_SPEC.
  const { data: myPermissions } = useMyPermissions(currentUser?.id ?? null);
  const hasModifSpec = (myPermissions ?? []).includes('BON_MODIFIER_SPEC');

  const [commentaire, setCommentaire] = useState('');
  const [showSignModal, setShowSignModal] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  // Sous-bon dont on prépare le décaissement (modal). null = modal fermé.
  const [preparingSousBon, setPreparingSousBon] = useState<SousBon | null>(null);
  // null = pas encore édité → on affiche la valeur du bon ; sinon la saisie en cours.
  const [porteurDraft, setPorteurDraft] = useState<string | null>(null);
  // Décaissement global (tous les sous-bons d'un coup) : modal + champs bénéficiaire.
  const [showDecaisserTout, setShowDecaisserTout] = useState(false);
  const [beneficiaireTout, setBeneficiaireTout] = useState('');
  const [pieceTout, setPieceTout] = useState('');

  const bon = bonQuery.data;
  const soubons = sousBonsQuery.data ?? [];
  // Sous-bons encore décaissables (statut VALIDE) → cible du « Décaisser tout ».
  const sousBonsDecaissables = soubons.filter((sb) => sb.statut === 'VALIDE');
  const impression = impressionQuery.data ?? null;
  const porteurValue = porteurDraft ?? bon?.porteur ?? '';
  // Modification autorisée uniquement au statut CREE, pour un validateur ou BON_MODIFIER_SPEC.
  const canEditBon = bon?.statut === 'CREE' && (isValidateur || hasModifSpec);

  const userById = useMemo(() => new Map((usersList ?? []).map((u) => [u.id, u])), [usersList]);
  const imprimeParLabel = impression
    ? (() => {
        const u = userById.get(impression.imprimeParId);
        return u ? `${u.prenom} ${u.nom}` : `#${impression.imprimeParId}`;
      })()
    : null;

  const canReprint = ['VALIDE', 'DECAISSE', 'COMPTABILISE'].includes(bon?.statut ?? '');
  const needRecordPrint = bon?.statut === 'VALIDE' && !impression;

  const handlePrint = () => {
    if (!bon) return;
    const userLabel = currentUser ? `${currentUser.prenom} ${currentUser.nom}` : '—';
    const doOpen = () => openPrintWindow(bon, soubons, userLabel, impression?.signatureImage ?? null);
    if (needRecordPrint) {
      print.mutate(undefined, { onSuccess: doOpen });
    } else {
      doOpen();
    }
  };

  const handleSignConfirm = (signatureImage: string) => {
    sign.mutate({ signatureImage }, {
      onSuccess: () => setShowSignModal(false),
    });
  };

  return (
    <div className="space-y-4">
      <Link to="/bons" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Retour aux bons
      </Link>

      {bonQuery.isLoading && <p className="text-muted-foreground">Chargement…</p>}
      {bonQuery.isError && <p className="text-destructive">Bon introuvable.</p>}

      {bon && (
        <>
          <Card>
            <CardHeader className="flex-row items-start justify-between space-y-0">
              <div>
                <CardTitle>{bon.numero}</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Créé le {new Date(bon.createdAt).toLocaleString('fr-FR')}
                  {bon.estRecurrent ? ' · récurrent' : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {canEditBon && (
                  <Button variant="outline" size="sm" onClick={() => setShowEdit(true)}>
                    <Pencil className="h-4 w-4" /> Modifier
                  </Button>
                )}
                <StatutBadge statut={bon.statut} />
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-muted-foreground">Montant total</span>
                <span className="text-lg font-semibold tabular-nums">{formatMontant(bon.montantTotal)}</span>
              </div>
              {bon.porteur && (
                <div className="flex items-baseline justify-between border-t pt-2">
                  <span className="text-sm text-muted-foreground">Porteur (caisse)</span>
                  <span className="text-sm font-medium">{bon.porteur}</span>
                </div>
              )}
              {bon.statutExtension && bon.statutExtension !== 'NON' && (
                <div className="border-t pt-2">
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm text-muted-foreground">Extension de budget</span>
                    <span
                      className={cn(
                        'rounded-full px-2.5 py-1 text-[11px] font-semibold',
                        bon.statutExtension === 'EN_ATTENTE' && 'bg-[#FFFBEB] text-[#92400E]',
                        bon.statutExtension === 'APPROUVEE' && 'bg-[#ECFDF5] text-[#047857]',
                        bon.statutExtension === 'REFUSEE' && 'bg-[#FEF3F2] text-[#B42318]',
                      )}
                    >
                      {bon.statutExtension === 'EN_ATTENTE'
                        ? 'En attente'
                        : bon.statutExtension === 'APPROUVEE'
                          ? `Approuvée${bon.extensionMode === 'RECHARGE' ? ' · recharge' : bon.extensionMode === 'DECOUVERT' ? ' · découvert' : ''}`
                          : 'Refusée'}
                    </span>
                  </div>
                  {bon.descriptionExtension && (
                    <p className="mt-1 text-[12px] text-muted-foreground">
                      Justification : {bon.descriptionExtension}
                    </p>
                  )}
                  {bon.extensionCommentaire && (
                    <p className="mt-0.5 text-[12px] text-muted-foreground">
                      Décision : {bon.extensionCommentaire}
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Sous-bons</CardTitle>
              {bon.statut === 'VALIDE' && isCaissier && sousBonsDecaissables.length > 1 && (
                <Button
                  size="sm"
                  onClick={() => {
                    setBeneficiaireTout(bon.porteur ?? '');
                    setPieceTout('');
                    setShowDecaisserTout(true);
                  }}
                  className="bg-[#00C896] text-white hover:bg-[#047857]"
                >
                  Décaisser tout ({sousBonsDecaissables.length})
                </Button>
              )}
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="border-y text-left text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 font-medium">#</th>
                    <th className="px-4 py-2 font-medium">Libellé</th>
                    <th className="px-4 py-2 font-medium">BL</th>
                    <th className="px-4 py-2 font-medium">Manutention</th>
                    <th className="px-4 py-2 font-medium">Centre de coût</th>
                    <th className="px-4 py-2 font-medium">Nature d'opération</th>
                    <th className="px-4 py-2 text-right font-medium">Montant</th>
                    <th className="px-4 py-2 font-medium">Statut</th>
                    {bon.statut === 'VALIDE' && (
                      <th className="px-4 py-2 text-right font-medium">Action</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {soubons.map((sb) => {
                    const existingPrepare = preparationBySousBonId.get(String(sb.id));
                    const canPrepare =
                      bon.statut === 'VALIDE' &&
                      isCaissier &&
                      sb.statut === 'VALIDE';

                    // Diagnostic du blocage par sous-bon (affiché à la place du bouton)
                    let blocker: { label: string; tone: string } | null = null;
                    if (bon.statut === 'VALIDE' && !canPrepare) {
                      if (sb.statut === 'DECAISSE' || sb.statut === 'COMPTABILISE') {
                        blocker = { label: 'Déjà décaissé', tone: 'bg-[#ECFDF5] text-[#047857]' };
                      } else if (sb.statut === 'ANNULE') {
                        blocker = { label: 'Annulé', tone: 'bg-[#F1F5F9] text-[#64748B]' };
                      } else if (sb.statut === 'REFUSE') {
                        blocker = { label: 'Refusé', tone: 'bg-[#FEF3F2] text-[#B42318]' };
                      } else if (sb.statut !== 'VALIDE') {
                        blocker = { label: `Statut ${sb.statut}`, tone: 'bg-[#F1F5F9] text-[#475569]' };
                      } else if (!isCaissier) {
                        blocker = { label: 'Réservé caissier', tone: 'bg-[#F1F5F9] text-[#475569]' };
                      }
                    }

                    return (
                      <tr key={sb.id} className="border-b last:border-0">
                        <td className="px-4 py-2">{sb.numeroSousBon}</td>
                        <td className="px-4 py-2">{sb.libelle}</td>
                        <td className="px-4 py-2">{sb.numeroBl}</td>
                        <td className="px-4 py-2">{sb.codeManutention}</td>
                        <td className="px-4 py-2">
                          {sb.costCenterId && costCenterById.get(String(sb.costCenterId)) ? (
                            <span title={costCenterById.get(String(sb.costCenterId))!.libelle}>
                              {costCenterById.get(String(sb.costCenterId))!.code}
                              <span className="ml-1 text-muted-foreground">
                                — {costCenterById.get(String(sb.costCenterId))!.libelle}
                              </span>
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          {sb.natureOperationId && natureOpById.get(String(sb.natureOperationId)) ? (
                            <span title={natureOpById.get(String(sb.natureOperationId))!.libelle}>
                              {natureOpById.get(String(sb.natureOperationId))!.code}
                              <span className="ml-1 text-muted-foreground">
                                — {natureOpById.get(String(sb.natureOperationId))!.libelle}
                              </span>
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">{formatMontant(sb.montant)}</td>
                        <td className="px-4 py-2">
                          <StatutBadge statut={sb.statut} />
                        </td>
                        {bon.statut === 'VALIDE' && (
                          <td className="px-4 py-2 text-right">
                            {canPrepare ? (
                              <button
                                type="button"
                                onClick={() => setPreparingSousBon(sb)}
                                className={
                                  existingPrepare
                                    ? 'inline-flex items-center gap-1 rounded-[7px] bg-[#FFFBEB] px-3 py-1 text-[11px] font-semibold text-[#92400E] transition hover:bg-[#FEF3C7]'
                                    : 'inline-flex items-center gap-1 rounded-[7px] bg-[#00C896] px-3 py-1 text-[11px] font-semibold text-white transition hover:bg-[#047857]'
                                }
                              >
                                {existingPrepare ? 'Reprendre la préparation' : 'Décaisser'}
                              </button>
                            ) : blocker ? (
                              <span
                                className={`inline-flex items-center gap-1 rounded-[7px] px-2.5 py-1 text-[10px] font-medium ${blocker.tone}`}
                              >
                                {blocker.label}
                              </span>
                            ) : (
                              <span className="text-[11px] text-muted-foreground">—</span>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                  {soubons.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">
                        Aucun sous-bon.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {bon.statut === 'CREE' && isValidateur && (isAdminRole || bon.demandeurId !== currentUser?.id) && (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="porteur">
                      Porteur — personne qui se présentera à la caisse{' '}
                      <span className="text-muted-foreground">(optionnel)</span>
                    </Label>
                    <Input
                      id="porteur"
                      value={porteurValue}
                      onChange={(e) => setPorteurDraft(e.target.value)}
                      placeholder="Nom de la personne qui ira retirer à la caisse…"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="commentaire">Commentaire (optionnel)</Label>
                    <Input
                      id="commentaire"
                      value={commentaire}
                      onChange={(e) => setCommentaire(e.target.value)}
                      placeholder="Motif de validation ou de refus…"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      disabled={validate.isPending}
                      onClick={() =>
                        validate.mutate({
                          approuve: true,
                          commentaire: commentaire || undefined,
                          porteur: porteurValue.trim(),
                        })
                      }
                    >
                      Valider
                    </Button>
                    <Button
                      variant="destructive"
                      disabled={validate.isPending}
                      onClick={() => validate.mutate({ approuve: false, commentaire: commentaire || undefined })}
                    >
                      Refuser
                    </Button>
                  </div>
                  {errMessage(validate.error) && (
                    <p className="text-sm text-destructive">{errMessage(validate.error)}</p>
                  )}
                </div>
              )}

              {canReprint && (
                <div className="space-y-4">
                  {/* Jalons impression / signature — toujours visibles tant que le bon est dans un statut imprimable */}
                  <div className="grid gap-2 rounded-md border bg-[#F8FAFC] p-3 text-xs sm:grid-cols-2">
                    <div className="flex items-center gap-2">
                      <Printer className={impression ? 'h-4 w-4 text-[#059669]' : 'h-4 w-4 text-[#94A3B8]'} />
                      {impression ? (
                        <span>
                          Imprimé le{' '}
                          <strong>{new Date(impression.dateImpression).toLocaleString('fr-FR')}</strong>
                          {imprimeParLabel ? ` par ${imprimeParLabel}` : ''}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Non imprimé</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2
                        className={impression?.aSigne ? 'h-4 w-4 text-[#059669]' : 'h-4 w-4 text-[#94A3B8]'}
                      />
                      {impression?.aSigne && impression.dateSignature ? (
                        <span>
                          Signé le <strong>{new Date(impression.dateSignature).toLocaleString('fr-FR')}</strong>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Non signé</span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" disabled={print.isPending} onClick={handlePrint}>
                      <Printer className="h-4 w-4" />{' '}
                      {print.isPending ? 'Préparation…' : needRecordPrint ? 'Imprimer' : 'Réimprimer'}
                    </Button>
                    {bon.statut === 'VALIDE' && (
                      <Button
                        variant="outline"
                        disabled={!impression || impression.aSigne}
                        onClick={() => setShowSignModal(true)}
                      >
                        <CheckCircle2 className="h-4 w-4" /> Signer
                      </Button>
                    )}
                  </div>
                  {(errMessage(print.error) || errMessage(sign.error)) && (
                    <p className="text-sm text-destructive">{errMessage(print.error) ?? errMessage(sign.error)}</p>
                  )}

                  {bon.statut === 'VALIDE' && (() => {
                    const decaissableSoubons = soubons.filter((sb) => sb.statut === 'VALIDE');
                    const sousBonsTraités = soubons.filter((sb) =>
                      ['DECAISSE', 'COMPTABILISE', 'ANNULE', 'REFUSE'].includes(sb.statut),
                    );
                    const sousBonsEnAttenteValidation = soubons.filter((sb) => sb.statut === 'CREE');
                    const allDone =
                      soubons.length > 0 && sousBonsTraités.length === soubons.length;
                    const stuckInCree =
                      soubons.length > 0 &&
                      sousBonsEnAttenteValidation.length === soubons.length;
                    const prerequisites = [
                      { ok: bon.statut === 'VALIDE', label: 'Bon validé' },
                      { ok: !!impression, label: 'Bon imprimé' },
                      { ok: !!impression?.aSigne, label: 'Bon signé' },
                      { ok: isCaissier, label: 'Rôle Caissier' },
                      {
                        ok: decaissableSoubons.length > 0,
                        label: `${decaissableSoubons.length} sous-bon${decaissableSoubons.length > 1 ? 's' : ''} décaissable${decaissableSoubons.length > 1 ? 's' : ''}`,
                      },
                    ];
                    const ready = prerequisites.every((p) => p.ok);
                    return (
                      <div className={`space-y-3 rounded-md border p-4 ${ready ? 'bg-[#ECFDF5]/30 border-[#10B981]/30' : 'bg-[#F8FAFC]'}`}>
                        <p className="text-sm font-medium">Décaissement</p>

                        {/* Check-list des pré-requis */}
                        <ul className="space-y-1.5">
                          {prerequisites.map((p) => (
                            <li key={p.label} className="flex items-center gap-2 text-xs">
                              <span
                                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                                  p.ok ? 'bg-[#10B981] text-white' : 'bg-[#FEF3F2] text-[#B42318]'
                                }`}
                              >
                                {p.ok ? '✓' : '✗'}
                              </span>
                              <span className={p.ok ? 'text-[#0F172A]' : 'text-[#B42318]'}>
                                {p.label}
                              </span>
                            </li>
                          ))}
                        </ul>

                        {ready ? (
                          <p className="text-xs text-[#047857]">
                            Tout est prêt. Utilisez le bouton <strong>Décaisser</strong> (ou{' '}
                            <strong>Reprendre la préparation</strong> si un brouillon existe) sur
                            chaque ligne du tableau des sous-bons ci-dessus.
                          </p>
                        ) : !impression ? (
                          <p className="text-xs text-[#92400E]">
                            ➤ <strong>Étape suivante :</strong> imprimer le bon via le bouton « Imprimer » ci-dessus.
                          </p>
                        ) : !impression.aSigne ? (
                          <p className="text-xs text-[#92400E]">
                            ➤ <strong>Étape suivante :</strong> signer le bon via le bouton « Signer » ci-dessus.
                          </p>
                        ) : !isCaissier ? (
                          <p className="text-xs text-[#B42318]">
                            ➤ Votre profil ne dispose pas du rôle <strong>Caissier</strong>. Demandez à un caissier de prendre le relais.
                          </p>
                        ) : stuckInCree ? (
                          <p className="text-xs text-[#B42318]">
                            ⚠ Les sous-bons sont restés en statut <strong>CREE</strong> alors que le bon est <strong>VALIDE</strong>. C'était un bug
                            de propagation à la validation, désormais corrigé. Pour ce bon existant,
                            demandez à un administrateur de mettre à jour les sous-bons en BD :
                            <code className="ml-1 rounded bg-[#FEF3F2] px-1.5 py-0.5 font-mono text-[10px]">
                              UPDATE trx_sous_bon SET statut='VALIDE' WHERE bon_id={bon.id} AND statut='CREE';
                            </code>
                          </p>
                        ) : allDone ? (
                          <p className="text-xs text-[#047857]">
                            Tous les sous-bons ont déjà été traités. Aucune action n'est plus nécessaire.
                          </p>
                        ) : null}

                        {preparationBySousBonId.size > 0 && (
                          <p className="text-xs text-[#92400E]">
                            <strong>{preparationBySousBonId.size}</strong> préparation
                            {preparationBySousBonId.size > 1 ? 's' : ''} en cours sur ce bon.
                          </p>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}

              {(bon.statut === 'ANNULE' || bon.statut === 'REFUSE') && (
                <p className="text-sm text-muted-foreground">Aucune action disponible pour ce statut.</p>
              )}

              {(bon.statut === 'CREE' || bon.statut === 'VALIDE') && (
                <div className="border-t pt-4">
                  <Button variant="ghost" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
                    Annuler le bon
                  </Button>
                  {errMessage(cancel.error) && (
                    <p className="text-sm text-destructive">{errMessage(cancel.error)}</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Modal d'édition du bon et de ses sous-bons (statut CREE) */}
      {showEdit && bon && (
        <EditBonModal bon={bon} soubons={soubons} onClose={() => setShowEdit(false)} />
      )}

      {/* Modal de signature */}
      {showSignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-[13px] border border-[rgba(15,76,129,0.1)] bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-[rgba(15,76,129,0.07)] px-5 py-3">
              <div className="font-display text-sm font-semibold text-[#0F172A]">
                Signer le bon {bon?.numero ?? ''}
              </div>
              <button
                type="button"
                aria-label="Fermer"
                onClick={() => setShowSignModal(false)}
                className="flex h-7 w-7 items-center justify-center rounded-[7px] text-[#94A3B8] hover:bg-[#F8FAFC] hover:text-[#0F172A]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5">
              <p className="mb-3 text-xs text-[#64748B]">
                Signez ci-dessous avec la souris ou le doigt, puis validez. Votre signature confirme l'approbation
                du décaissement.
              </p>
              <SignaturePad
                busy={sign.isPending}
                onCancel={() => setShowSignModal(false)}
                onConfirm={handleSignConfirm}
              />
              {errMessage(sign.error) && (
                <p className="mt-3 text-sm text-destructive">{errMessage(sign.error)}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de préparation du décaissement (workflow BonCaisse) */}
      {preparingSousBon && bon && (
        <PreparationDecaissementModal
          bonId={bon.id}
          sousBonOriginal={preparingSousBon}
          defaultBeneficiaire={bon.porteur ?? null}
          onClose={() => setPreparingSousBon(null)}
          onDone={() => setPreparingSousBon(null)}
        />
      )}

      {/* Modal « Décaisser tout le bon » — décaisse tous les sous-bons VALIDE d'un coup */}
      {showDecaisserTout && bon && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-[13px] border border-[rgba(15,76,129,0.1)] bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-[rgba(15,76,129,0.07)] px-5 py-3">
              <div className="font-display text-sm font-semibold text-[#0F172A]">
                Décaisser tout le bon {bon.numero}
              </div>
              <button
                type="button"
                aria-label="Fermer"
                onClick={() => setShowDecaisserTout(false)}
                className="flex h-7 w-7 items-center justify-center rounded-[7px] text-[#94A3B8] hover:bg-[#F8FAFC] hover:text-[#0F172A]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3 p-5">
              <p className="text-xs text-[#64748B]">
                {sousBonsDecaissables.length} sous-bon{sousBonsDecaissables.length > 1 ? 's' : ''} encore à
                décaisser seront décaissés en une seule fois, au nom du bénéficiaire ci-dessous.
              </p>
              <div className="space-y-2">
                <Label htmlFor="benef-tout">Bénéficiaire (personne qui retire)</Label>
                <Input
                  id="benef-tout"
                  value={beneficiaireTout}
                  onChange={(e) => setBeneficiaireTout(e.target.value)}
                  placeholder="Nom du bénéficiaire…"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="piece-tout">
                  Pièce d'identité <span className="text-muted-foreground">(optionnel)</span>
                </Label>
                <Input
                  id="piece-tout"
                  value={pieceTout}
                  onChange={(e) => setPieceTout(e.target.value)}
                  placeholder="N° CNI / passeport…"
                />
              </div>
              {errMessage(decaisserTout.error) && (
                <p className="text-sm text-destructive">{errMessage(decaisserTout.error)}</p>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={() => setShowDecaisserTout(false)} disabled={decaisserTout.isPending}>
                  Annuler
                </Button>
                <Button
                  className="bg-[#00C896] text-white hover:bg-[#047857]"
                  disabled={decaisserTout.isPending || !beneficiaireTout.trim()}
                  onClick={() =>
                    decaisserTout.mutate(
                      { beneficiaire: beneficiaireTout.trim(), beneficiairePiece: pieceTout.trim() || undefined },
                      { onSuccess: () => setShowDecaisserTout(false) },
                    )
                  }
                >
                  {decaisserTout.isPending ? 'Décaissement…' : 'Confirmer le décaissement'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
