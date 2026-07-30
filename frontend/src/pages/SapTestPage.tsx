import { useEffect, useState } from 'react';
import { CheckCircle2, Plug, Search, ServerCog, XCircle } from 'lucide-react';
import {
  useSapPing,
  useVerifierClientSap,
  useVerifierCommandeSap,
  useCheckEcritureSap,
  usePosterEcritureSap,
  useContrepasserSap,
  useListComptesSap,
  useSapMapping,
  useSetSapMapping,
  useSapCostCenterMapping,
  useSetSapCostCenterMapping,
  useSearchCostCentersSap,
  type LigneEcriture,
  type SapClientInfo,
  type SapCommandeInfo,
} from '@/api/sap';
import { apiErrorMessage } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Panel, PanelHeader } from '@/components/ui/panel';

/** Libellé lisible d'un type de document d'achat SAP. */
function docTypeLabel(t: string): string {
  const map: Record<string, string> = {
    NB: 'Achat (standard)',
    UB: 'Transfert de stock',
    ZUB: 'Transfert de stock',
    FO: 'Commande cadre',
    K: 'Contrat',
    L: 'Programme de livraison',
  };
  return map[t] ? `${map[t]} (${t})` : t;
}

/** Formate une date SAP AAAAMMJJ en JJ/MM/AAAA. */
function formatSapDate(d: string): string {
  if (/^\d{8}$/.test(d) && d !== '00000000') return `${d.slice(6, 8)}/${d.slice(4, 6)}/${d.slice(0, 4)}`;
  return d;
}

/** Rend un objet SAP (details) en petit tableau clé/valeur (champs non vides). */
function DetailsTable({ data }: { data?: Record<string, unknown> }) {
  if (!data) return null;
  const rows = Object.entries(data).filter(([, v]) => v != null && String(v).trim() !== '');
  if (rows.length === 0) return null;
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-[11px] text-[#64748B]">Voir tous les champs renvoyés ({rows.length})</summary>
      <table className="mt-2 w-full text-[11px]">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k} className="border-t border-[rgba(15,76,129,0.06)]">
              <td className="px-2 py-1 font-medium text-[#475569]">{k}</td>
              <td className="px-2 py-1 text-[#0F172A]">{String(v)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

function Messages({ messages }: { messages: string[] }) {
  if (!messages?.length) return null;
  return (
    <ul className="mt-2 space-y-1">
      {messages.map((m, i) => (
        <li
          key={i}
          className={
            m.startsWith('[E]') || m.startsWith('[A]')
              ? 'text-[11px] text-[#B42318]'
              : m.startsWith('[W]')
                ? 'text-[11px] text-[#B45309]'
                : 'text-[11px] text-[#64748B]'
          }
        >
          {m}
        </li>
      ))}
    </ul>
  );
}

/** Mapping centre de coût (appli) → centre de coût SAP. Requis pour poster avec analytique. */
function CostCenterMappingPanel() {
  const { data: rows } = useSapCostCenterMapping();
  const save = useSetSapCostCenterMapping();
  const [draft, setDraft] = useState<Record<string, string>>({});
  useEffect(() => {
    if (rows) setDraft(Object.fromEntries(rows.map((r) => [r.costCenterApp, r.costCenterSap ?? ''])));
  }, [rows]);
  const cls =
    'flex h-8 w-40 rounded-[7px] border border-[rgba(15,76,129,0.12)] bg-white px-2 text-xs outline-none focus:border-[#1A6DB5]';

  return (
    <Panel>
      <PanelHeader title="Mapping centres de coût SAP" />
      <div className="space-y-2 p-[18px]">
        <p className="text-[11px] text-[#64748B]">
          Traduit chaque centre de coût de l’appli vers le centre de coût SAP. Laissé vide = aucun centre envoyé (évite
          l’erreur « centre inexistant »).
        </p>
        {(rows ?? []).map((r) => (
          <div key={r.costCenterApp} className="flex items-center gap-2">
            <span className="w-40 text-xs font-medium text-[#0F172A]">{r.costCenterApp}</span>
            <span className="text-[#94A3B8]">→</span>
            <input
              className={cls}
              placeholder="Centre de coût SAP"
              value={draft[r.costCenterApp] ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, [r.costCenterApp]: e.target.value }))}
            />
            <button
              type="button"
              onClick={() => save.mutate({ costCenterApp: r.costCenterApp, costCenterSap: draft[r.costCenterApp] || null })}
              disabled={save.isPending}
              className="rounded-[7px] border border-[rgba(15,76,129,0.2)] px-2 py-1 text-[11px] font-medium text-[#0F4C81] transition hover:bg-[#EFF6FF] disabled:opacity-50"
            >
              Enregistrer
            </button>
            {r.costCenterSap ? (
              <span className="text-[11px] text-[#047857]">✓ {r.costCenterSap}</span>
            ) : (
              <span className="text-[11px] text-[#94A3B8]">non envoyé</span>
            )}
          </div>
        ))}
        <CostCentersSapBrowser />
      </div>
    </Panel>
  );
}

/** Recherche des vrais centres de coût SAP (domaine 2251) → clic pour copier. */
function CostCentersSapBrowser() {
  const search = useSearchCostCentersSap();
  const [q, setQ] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const cls =
    'flex h-8 rounded-[7px] border border-[rgba(15,76,129,0.12)] bg-white px-2 text-xs outline-none focus:border-[#1A6DB5]';
  return (
    <details className="mt-2 rounded-[9px] border border-[rgba(15,76,129,0.1)] bg-[#FBFCFE] p-2">
      <summary className="cursor-pointer text-[11px] font-medium text-[#0F4C81]">
        Trouver un centre de coût SAP (domaine 2251)
      </summary>
      <div className="mt-2 space-y-2">
        <div className="flex items-center gap-1.5">
          <input
            className={cls + ' flex-1'}
            placeholder="code ou libellé (ex : DSI, usine, 22100)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') search.mutate(q);
            }}
          />
          <Button onClick={() => search.mutate(q)} disabled={search.isPending}>
            {search.isPending ? '…' : 'Chercher'}
          </Button>
        </div>
        {search.isError && (
          <p className="text-[11px] text-[#B42318]">{apiErrorMessage(search.error, 'Centres indisponibles')}</p>
        )}
        {search.data &&
          (search.data.length === 0 ? (
            <p className="text-[11px] text-[#64748B]">Aucun centre trouvé.</p>
          ) : (
            <div className="max-h-52 overflow-y-auto rounded-[7px] border border-[rgba(15,76,129,0.08)]">
              {search.data.map((c) => (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(c.code);
                    setCopied(c.code);
                  }}
                  className="flex w-full items-center gap-2 border-b border-[rgba(15,76,129,0.05)] px-2 py-1 text-left text-[11px] hover:bg-[#EFF6FF]"
                >
                  <span className="font-medium text-[#0F172A]">{c.code}</span>
                  <span className="flex-1 truncate text-[#64748B]">{c.libelle}</span>
                  {copied === c.code && <span className="text-[10px] text-[#047857]">copié ✓</span>}
                </button>
              ))}
            </div>
          ))}
        <p className="text-[10px] text-[#94A3B8]">
          Clique un centre pour le copier, puis colle-le dans la ligne du centre appli à mapper.
        </p>
      </div>
    </details>
  );
}

/** Recherche de vrais comptes GL (société / plan PCGG) → clic pour copier. */
function ComptesBrowser({ societe }: { societe: string }) {
  const search = useListComptesSap();
  const [q, setQ] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const cls =
    'flex h-8 rounded-[7px] border border-[rgba(15,76,129,0.12)] bg-white px-2 text-xs outline-none focus:border-[#1A6DB5]';
  return (
    <details className="rounded-[9px] border border-[rgba(15,76,129,0.1)] bg-[#FBFCFE] p-2">
      <summary className="cursor-pointer text-[11px] font-medium text-[#0F4C81]">
        Trouver un compte GL (société {societe}, plan PCGG)
      </summary>
      <div className="mt-2 space-y-2">
        <div className="flex items-center gap-1.5">
          <input
            className={cls + ' flex-1'}
            placeholder="n° ou libellé (ex : 52, banque, client)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') search.mutate({ q, societe });
            }}
          />
          <Button onClick={() => search.mutate({ q, societe })} disabled={search.isPending}>
            {search.isPending ? '…' : 'Chercher'}
          </Button>
        </div>
        {search.isError && (
          <p className="text-[11px] text-[#B42318]">{apiErrorMessage(search.error, 'Comptes indisponibles')}</p>
        )}
        {search.data &&
          (search.data.length === 0 ? (
            <p className="text-[11px] text-[#64748B]">Aucun compte trouvé.</p>
          ) : (
            <div className="max-h-52 overflow-y-auto rounded-[7px] border border-[rgba(15,76,129,0.08)]">
              {search.data.map((c) => (
                <button
                  key={c.compte}
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(c.compte);
                    setCopied(c.compte);
                  }}
                  className="flex w-full items-center gap-2 border-b border-[rgba(15,76,129,0.05)] px-2 py-1 text-left text-[11px] hover:bg-[#EFF6FF]"
                >
                  <span className="font-medium text-[#0F172A]">{c.compte}</span>
                  <span className="flex-1 truncate text-[#64748B]">{c.libelle}</span>
                  {copied === c.compte && <span className="text-[10px] text-[#047857]">copié ✓</span>}
                </button>
              ))}
            </div>
          ))}
        <p className="text-[10px] text-[#94A3B8]">Clique un compte pour le copier, puis colle-le dans une ligne.</p>
      </div>
    </details>
  );
}

const MAP_LABELS: Record<string, string> = {
  CAISSE: 'Caisse',
  PORTEFEUILLE: 'Portefeuille / banque',
  RECETTE: 'Recette (encaissement)',
  CHARGE: 'Charge (décaissement)',
  CREDIT_EMPLOYE: 'Créance employé (crédit)',
  GAIN_CHANGE: 'Gain de change',
  PERTE_CHANGE: 'Perte de change',
};

/** Mapping type_compte (appli) → compte SAP (PCGG). Prérequis pour envoyer les opérations. */
function MappingPanel() {
  const { data: rows } = useSapMapping();
  const save = useSetSapMapping();
  const [draft, setDraft] = useState<Record<string, string>>({});
  useEffect(() => {
    if (rows) setDraft(Object.fromEntries(rows.map((r) => [r.typeCompte, r.compteSap ?? ''])));
  }, [rows]);
  const cls =
    'flex h-8 w-40 rounded-[7px] border border-[rgba(15,76,129,0.12)] bg-white px-2 text-xs outline-none focus:border-[#1A6DB5]';

  return (
    <Panel>
      <PanelHeader title="Mapping comptable SAP" />
      <div className="space-y-2 p-[18px]">
        <p className="text-[11px] text-[#64748B]">
          Associe chaque type de compte de l’appli au compte général SAP (plan PCGG). Requis pour l’envoi des opérations.
        </p>
        {(rows ?? []).map((r) => (
          <div key={r.typeCompte} className="flex items-center gap-2">
            <span className="w-52 text-xs font-medium text-[#0F172A]">{MAP_LABELS[r.typeCompte] ?? r.typeCompte}</span>
            <input
              className={cls}
              placeholder="Compte SAP (ex : 57100000)"
              value={draft[r.typeCompte] ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, [r.typeCompte]: e.target.value }))}
            />
            <button
              type="button"
              onClick={() => save.mutate({ typeCompte: r.typeCompte, compteSap: draft[r.typeCompte] || null })}
              disabled={save.isPending}
              className="rounded-[7px] border border-[rgba(15,76,129,0.2)] px-2 py-1 text-[11px] font-medium text-[#0F4C81] transition hover:bg-[#EFF6FF] disabled:opacity-50"
            >
              Enregistrer
            </button>
            {r.compteSap ? (
              <span className="text-[11px] text-[#047857]">→ {r.compteSap}</span>
            ) : (
              <span className="text-[11px] text-[#B45309]">non défini</span>
            )}
          </div>
        ))}
        <p className="text-[10px] text-[#94A3B8]">
          Astuce : utilise « Trouver un compte GL » (panneau ci-dessous) pour repérer les numéros PCGG.
        </p>
      </div>
    </Panel>
  );
}

/** Panneau de test posting : contrôle (CHECK, sûr) ou post réel d'une pièce. */
function EcriturePanel() {
  const check = useCheckEcritureSap();
  const post = usePosterEcritureSap();
  const contrepasse = useContrepasserSap();
  const [societe, setSociete] = useState('2251');
  const [devise, setDevise] = useState('XOF');
  const [typePiece, setTypePiece] = useState('SA');
  const [reference, setReference] = useState('FDC-TEST');
  const [lignes, setLignes] = useState<LigneEcriture[]>([
    { compteGL: '', sens: 'D', montant: 0, texte: '' },
    { compteGL: '', sens: 'C', montant: 0, texte: '' },
  ]);

  const num = (v: number) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const balance = lignes.reduce((a, l) => a + (l.sens === 'D' ? num(l.montant) : -num(l.montant)), 0);
  const equilibre = Math.abs(balance) < 0.0001 && lignes.every((l) => l.compteGL.trim() && num(l.montant) > 0);

  const setLigne = (i: number, patch: Partial<LigneEcriture>) =>
    setLignes((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const addLigne = () => setLignes((ls) => [...ls, { compteGL: '', sens: 'C', montant: 0, texte: '' }]);
  const removeLigne = (i: number) => setLignes((ls) => (ls.length > 2 ? ls.filter((_, j) => j !== i) : ls));

  const payload = () => ({
    societe,
    devise,
    typePiece: typePiece || undefined,
    reference: reference || undefined,
    lignes: lignes.map((l) => ({ ...l, montant: num(l.montant) })),
  });

  const result = check.data ?? post.data;
  const error = check.error ?? post.error;
  const cls =
    'flex h-8 rounded-[7px] border border-[rgba(15,76,129,0.12)] bg-white px-2 text-xs outline-none focus:border-[#1A6DB5]';

  return (
    <Panel>
      <PanelHeader title="Poster une écriture (test)" />
      <div className="space-y-3 p-[18px]">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <label className="space-y-1">
            <span className="text-[10px] uppercase tracking-[0.5px] text-[#64748B]">Société</span>
            <input className={cls + ' w-full'} value={societe} onChange={(e) => setSociete(e.target.value)} />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] uppercase tracking-[0.5px] text-[#64748B]">Devise</span>
            <input className={cls + ' w-full'} value={devise} onChange={(e) => setDevise(e.target.value)} />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] uppercase tracking-[0.5px] text-[#64748B]">Type pièce</span>
            <input className={cls + ' w-full'} value={typePiece} onChange={(e) => setTypePiece(e.target.value)} />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] uppercase tracking-[0.5px] text-[#64748B]">Référence</span>
            <input className={cls + ' w-full'} value={reference} onChange={(e) => setReference(e.target.value)} />
          </label>
        </div>

        <ComptesBrowser societe={societe} />

        <div className="space-y-1.5">
          {lignes.map((l, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <input placeholder="Compte GL" className={cls + ' flex-1'} value={l.compteGL} onChange={(e) => setLigne(i, { compteGL: e.target.value })} />
              <select className={cls} value={l.sens} onChange={(e) => setLigne(i, { sens: e.target.value as 'D' | 'C' })}>
                <option value="D">Débit</option>
                <option value="C">Crédit</option>
              </select>
              <input type="number" min="0" placeholder="Montant" className={cls + ' w-24'} value={l.montant || ''} onChange={(e) => setLigne(i, { montant: Number(e.target.value) })} />
              <input placeholder="Libellé" className={cls + ' flex-1'} value={l.texte ?? ''} onChange={(e) => setLigne(i, { texte: e.target.value })} />
              <input placeholder="C.coût" className={cls + ' w-20'} value={l.centreCout ?? ''} onChange={(e) => setLigne(i, { centreCout: e.target.value })} />
              <button type="button" onClick={() => removeLigne(i)} disabled={lignes.length <= 2} className="px-1.5 text-[#B42318] disabled:opacity-30" title="Retirer">
                ×
              </button>
            </div>
          ))}
          <button type="button" onClick={addLigne} className="text-[11px] font-medium text-[#0F4C81] hover:underline">
            + Ajouter une ligne
          </button>
        </div>

        <p className={equilibre ? 'text-[11px] text-[#047857]' : 'text-[11px] text-[#B45309]'}>
          {Math.abs(balance) < 0.0001 ? 'Équilibré ✓' : `Déséquilibre débit/crédit : ${balance.toFixed(2)}`}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => {
              post.reset();
              check.mutate(payload());
            }}
            disabled={!equilibre || check.isPending}
          >
            {check.isPending ? 'Contrôle…' : 'Contrôler (CHECK — n’écrit rien)'}
          </Button>
          <button
            type="button"
            onClick={() => {
              if (window.confirm('Poster RÉELLEMENT cette pièce dans SAP ?')) {
                check.reset();
                post.mutate(payload());
              }
            }}
            disabled={!equilibre || post.isPending}
            className="rounded-[9px] border border-[#B42318] px-3.5 py-2 text-xs font-semibold text-[#B42318] transition hover:bg-[#FEF2F2] disabled:opacity-40"
          >
            {post.isPending ? 'Post…' : 'Poster (écrit en SAP)'}
          </button>
        </div>

        {error && <p className="text-xs text-[#B42318]">{apiErrorMessage(error, 'Échec')}</p>}
        {result && (
          <div className={'rounded-[10px] border p-3 ' + (result.ok ? 'border-[#A7F3D0] bg-[#ECFDF5]' : 'border-[#FECDCA] bg-[#FEF3F2]')}>
            <div className="flex items-center gap-2 text-sm font-semibold">
              {result.ok ? <CheckCircle2 className="h-4 w-4 text-[#047857]" /> : <XCircle className="h-4 w-4 text-[#B42318]" />}
              {result.dryRun
                ? result.ok
                  ? 'Contrôle OK — la pièce est valide (rien écrit)'
                  : 'Contrôle en erreur'
                : result.ok
                  ? `Posté ✓ — pièce ${result.numeroPiece ?? ''}`
                  : 'Post refusé'}
            </div>
            <Messages messages={result.messages} />
            {!result.dryRun && result.ok && result.numeroPiece && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('Contrepasser (annuler) cette pièce dans SAP ?'))
                      contrepasse.mutate({ objKey: result.numeroPiece! });
                  }}
                  disabled={contrepasse.isPending}
                  className="rounded-[8px] border border-[#B45309] px-2.5 py-1 text-[11px] font-medium text-[#B45309] transition hover:bg-[#FFFBEB] disabled:opacity-50"
                >
                  {contrepasse.isPending ? 'Contrepassation…' : 'Contrepasser cette pièce'}
                </button>
                {contrepasse.data &&
                  (contrepasse.data.ok ? (
                    <span className="text-[11px] text-[#047857]">Contrepassée ✓ — pièce {contrepasse.data.numeroPiece}</span>
                  ) : (
                    <span className="text-[11px] text-[#B42318]">Échec contrepassation</span>
                  ))}
                {contrepasse.isError && (
                  <span className="text-[11px] text-[#B42318]">{apiErrorMessage(contrepasse.error, 'Erreur')}</span>
                )}
              </div>
            )}
            {contrepasse.data && <Messages messages={contrepasse.data.messages} />}
          </div>
        )}
      </div>
    </Panel>
  );
}

export function SapTestPage() {
  const ping = useSapPing();
  const client = useVerifierClientSap();
  const commande = useVerifierCommandeSap();
  const [codeClient, setCodeClient] = useState('');
  const [numCommande, setNumCommande] = useState('');

  const clientRes = client.data as SapClientInfo | undefined;
  const commandeRes = commande.data as SapCommandeInfo | undefined;

  const inputCls =
    'flex h-9 w-full rounded-[9px] border border-[rgba(15,76,129,0.1)] bg-white px-3 text-xs text-[#0F172A] outline-none focus:border-[#1A6DB5]';

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      {/* Connexion */}
      <Panel>
        <PanelHeader title="SAP — connexion" />
        <div className="flex items-center gap-3 p-[18px]">
          <Button onClick={() => ping.mutate()} disabled={ping.isPending}>
            <Plug className="mr-1.5 h-4 w-4" />
            {ping.isPending ? 'Test…' : 'Tester la connexion'}
          </Button>
          {ping.isSuccess && (
            <span className="flex items-center gap-1.5 text-xs text-[#047857]">
              <CheckCircle2 className="h-4 w-4" /> {ping.data.message}
            </span>
          )}
          {ping.isError && (
            <span className="flex items-center gap-1.5 text-xs text-[#B42318]">
              <XCircle className="h-4 w-4" /> {apiErrorMessage(ping.error, 'Connexion SAP impossible')}
            </span>
          )}
        </div>
      </Panel>

      {/* Client */}
      <Panel>
        <PanelHeader title="Vérifier un client" />
        <div className="space-y-3 p-[18px]">
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="codeClient">Code client (KUNNR)</Label>
              <Input id="codeClient" className={inputCls} placeholder="Ex : 12345" value={codeClient} onChange={(e) => setCodeClient(e.target.value)} />
            </div>
            <Button onClick={() => codeClient.trim() && client.mutate(codeClient.trim())} disabled={client.isPending || !codeClient.trim()}>
              <Search className="mr-1.5 h-4 w-4" />
              {client.isPending ? 'Recherche…' : 'Vérifier'}
            </Button>
          </div>
          {client.isError && (
            <p className="text-xs text-[#B42318]">{apiErrorMessage(client.error, 'Vérification impossible')}</p>
          )}
          {clientRes && (
            <div className="rounded-[10px] border border-[rgba(15,76,129,0.1)] bg-[#FBFCFE] p-3">
              <div className="flex items-center gap-2">
                {clientRes.existe ? (
                  <CheckCircle2 className="h-4 w-4 text-[#047857]" />
                ) : (
                  <XCircle className="h-4 w-4 text-[#B42318]" />
                )}
                <span className="text-sm font-semibold">
                  {clientRes.nom ?? (clientRes.existe ? 'Client trouvé (nom à mapper — voir champs)' : '(client introuvable)')}
                </span>
                <span className="text-[11px] text-[#64748B]">· {clientRes.code}</span>
              </div>
              {(clientRes.ville || clientRes.pays) && (
                <p className="mt-1 text-xs text-[#475569]">
                  {clientRes.ville} {clientRes.pays && `(${clientRes.pays})`}
                </p>
              )}
              {(clientRes.identifiantFiscal || clientRes.telephone) && (
                <p className="mt-0.5 text-[11px] text-[#64748B]">
                  {clientRes.identifiantFiscal && `N° fiscal : ${clientRes.identifiantFiscal}`}
                  {clientRes.identifiantFiscal && clientRes.telephone && ' · '}
                  {clientRes.telephone && `Tél : ${clientRes.telephone}`}
                </p>
              )}
              <Messages messages={clientRes.messages} />
              <DetailsTable data={clientRes.details} />
            </div>
          )}
        </div>
      </Panel>

      {/* Commande */}
      <Panel>
        <PanelHeader title="Vérifier une commande d'achat" />
        <div className="space-y-3 p-[18px]">
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="numCommande">N° commande (EBELN)</Label>
              <Input id="numCommande" className={inputCls} placeholder="Ex : 4500001234" value={numCommande} onChange={(e) => setNumCommande(e.target.value)} />
            </div>
            <Button onClick={() => numCommande.trim() && commande.mutate(numCommande.trim())} disabled={commande.isPending || !numCommande.trim()}>
              <Search className="mr-1.5 h-4 w-4" />
              {commande.isPending ? 'Recherche…' : 'Vérifier'}
            </Button>
          </div>
          {commande.isError && (
            <p className="text-xs text-[#B42318]">{apiErrorMessage(commande.error, 'Vérification impossible')}</p>
          )}
          {commandeRes && (
            <div className="rounded-[10px] border border-[rgba(15,76,129,0.1)] bg-[#FBFCFE] p-3">
              <div className="flex items-center gap-2">
                {commandeRes.existe ? (
                  <CheckCircle2 className="h-4 w-4 text-[#047857]" />
                ) : (
                  <XCircle className="h-4 w-4 text-[#B42318]" />
                )}
                <span className="text-sm font-semibold">Commande {commandeRes.numero}</span>
              </div>
              <p className="mt-1 text-xs text-[#475569]">
                {commandeRes.typeDocument && (
                  <>Type : {docTypeLabel(commandeRes.typeDocument)} · </>
                )}
                {commandeRes.fournisseur
                  ? `Fournisseur : ${commandeRes.fournisseur}${commandeRes.fournisseurNom ? ` — ${commandeRes.fournisseurNom}` : ''}`
                  : commandeRes.usineSource
                    ? `Usine source : ${commandeRes.usineSource} (transfert)`
                    : 'Fournisseur : —'}
                {' · '}Société : {commandeRes.societe ?? '—'} · Devise : {commandeRes.devise ?? '—'}
                {commandeRes.conditionsPaiement && ` · Paiement : ${commandeRes.conditionsPaiement}`}
              </p>
              {(commandeRes.dateDocument || commandeRes.statut) && (
                <p className="mt-0.5 text-[11px] text-[#64748B]">
                  {commandeRes.dateDocument && `Date : ${formatSapDate(commandeRes.dateDocument)}`}
                  {commandeRes.dateDocument && commandeRes.statut && ' · '}
                  {commandeRes.statut && `Statut : ${commandeRes.statut}`}
                </p>
              )}
              <Messages messages={commandeRes.messages} />
              <DetailsTable data={commandeRes.details} />
            </div>
          )}
        </div>
      </Panel>

      <MappingPanel />

      <CostCenterMappingPanel />

      <EcriturePanel />

      <p className="flex items-center gap-1.5 text-[11px] text-[#94A3B8]">
        <ServerCog className="h-3.5 w-3.5" />
        Nécessite <code>node-rfc</code> + le SAP NWRFC SDK installés côté serveur, et les variables SAP_* dans le .env du backend.
      </p>
    </div>
  );
}
