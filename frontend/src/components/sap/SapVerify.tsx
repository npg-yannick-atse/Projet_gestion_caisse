import { useEffect, useRef, useState } from 'react';
import { useVerifierClientSap, useVerifierCommandeSap, useVerifierFournisseurSap } from '@/api/sap';

/** Délai (ms) après la dernière frappe avant d'interroger SAP. */
const DEBOUNCE_MS = 700;
/** Longueur minimale avant de déclencher une vérification (évite les partiels). */
const MIN_LEN = 4;

/** Libellé lisible d'un type de document d'achat SAP. */
function docTypeLabel(t?: string): string {
  if (!t) return '';
  const map: Record<string, string> = { NB: 'Achat', UB: 'Transfert de stock' };
  return map[t] ?? t;
}

export type SapVerifyStatus = 'idle' | 'checking' | 'found' | 'notfound' | 'error';

/**
 * Vérification AUTOMATIQUE d'un code client dans SAP : dès que `code` change
 * (après une courte pause), interroge SAP et auto-remplit le nom via `onResolved`.
 * `onStatus` remonte l'état de vérification (pour bloquer un bouton, etc.).
 */
export function SapClientVerify({
  code,
  onResolved,
  onStatus,
}: {
  code: string;
  onResolved: (nom: string) => void;
  onStatus?: (status: SapVerifyStatus) => void;
}) {
  const m = useVerifierClientSap();
  const [debounced, setDebounced] = useState('');
  const lastRef = useRef<string>('');
  const resolvedRef = useRef(onResolved);
  resolvedRef.current = onResolved;
  const statusRef = useRef(onStatus);
  statusRef.current = onStatus;

  const status: SapVerifyStatus = !code?.trim()
    ? 'idle'
    : m.isPending
      ? 'checking'
      : m.isError
        ? 'error'
        : m.data
          ? m.data.existe
            ? 'found'
            : 'notfound'
          : 'idle';
  useEffect(() => {
    statusRef.current?.(status);
  }, [status]);

  useEffect(() => {
    const v = (code ?? '').trim();
    const t = setTimeout(() => setDebounced(v), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [code]);

  useEffect(() => {
    if (debounced.length >= MIN_LEN && debounced !== lastRef.current) {
      lastRef.current = debounced;
      m.mutate(debounced, {
        onSuccess: (r) => {
          if (r.existe && r.nom) resolvedRef.current(r.nom);
        },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  if (!code?.trim()) return null;
  return (
    <div className="mt-1 text-[11px]">
      {m.isPending ? (
        <span className="text-[#64748B]">Vérification SAP…</span>
      ) : m.isError ? (
        <span className="text-[#B45309]">SAP indisponible</span>
      ) : m.data ? (
        m.data.existe ? (
          <span className="text-[#047857]">
            ✓ {m.data.nom ?? 'trouvé'}
            {m.data.ville ? ` · ${m.data.ville}` : ''}
          </span>
        ) : (
          <span className="text-[#B42318]">Client introuvable dans SAP</span>
        )
      ) : null}
    </div>
  );
}

/**
 * Vérification MANUELLE (au clic) d'un code client / n° de commande dans SAP.
 * Sert à « déverrouiller » la suite de la saisie : le résultat est remonté via
 * `onResult(existe, nom?)`. Affiche le bouton + le statut de la dernière vérif.
 */
export function SapCheckButton({
  kind,
  value,
  disabled,
  onResult,
}: {
  kind: 'client' | 'commande' | 'fournisseur';
  value: string;
  disabled?: boolean;
  onResult: (existe: boolean, nom?: string) => void;
}) {
  const clientM = useVerifierClientSap();
  const commandeM = useVerifierCommandeSap();
  const fournisseurM = useVerifierFournisseurSap();
  const m = kind === 'client' ? clientM : kind === 'fournisseur' ? fournisseurM : commandeM;
  const v = (value ?? '').trim();

  const run = () => {
    if (!v) return;
    m.mutate(v, { onSuccess: (r: any) => onResult(!!r.existe, r.nom) });
  };

  const data = m.data as any;
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={run}
        disabled={disabled || v.length < MIN_LEN || m.isPending}
        className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-md border border-[#0F4C81] px-3 text-xs font-medium text-[#0F4C81] transition hover:bg-[#EFF6FF] disabled:cursor-not-allowed disabled:opacity-40"
      >
        {m.isPending ? 'Vérification…' : 'Vérification'}
      </button>
      <div className="min-h-[14px] text-[11px] leading-tight">
        {m.isPending ? (
          <span className="text-[#64748B]">Vérification SAP…</span>
        ) : m.isError ? (
          <span className="text-[#B45309]">SAP indisponible</span>
        ) : data ? (
          data.existe ? (
            <span className="text-[#047857]">
              ✓ {kind === 'commande' ? docTypeLabel(data.typeDocument) || 'trouvé' : data.nom ?? 'trouvé'}
            </span>
          ) : (
            <span className="text-[#B42318]">
              {kind === 'client' ? 'Client introuvable' : kind === 'fournisseur' ? 'Fournisseur introuvable' : 'Commande introuvable'} dans SAP
            </span>
          )
        ) : null}
      </div>
    </div>
  );
}

/**
 * Vérification AUTOMATIQUE d'un n° de commande d'achat dans SAP.
 */
export function SapCommandeVerify({ numero }: { numero: string }) {
  const m = useVerifierCommandeSap();
  const [debounced, setDebounced] = useState('');
  const lastRef = useRef<string>('');

  useEffect(() => {
    const v = (numero ?? '').trim();
    const t = setTimeout(() => setDebounced(v), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [numero]);

  useEffect(() => {
    if (debounced.length >= MIN_LEN && debounced !== lastRef.current) {
      lastRef.current = debounced;
      m.mutate(debounced);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  if (!numero?.trim()) return null;
  return (
    <div className="mt-1 text-[11px]">
      {m.isPending ? (
        <span className="text-[#64748B]">Vérification SAP…</span>
      ) : m.isError ? (
        <span className="text-[#B45309]">SAP indisponible</span>
      ) : m.data ? (
        m.data.existe ? (
          <span className="text-[#047857]">
            ✓ {docTypeLabel(m.data.typeDocument)}
            {m.data.fournisseur
              ? ` · Fourn. ${m.data.fournisseur}${m.data.fournisseurNom ? ` — ${m.data.fournisseurNom}` : ''}`
              : m.data.usineSource
                ? ` · Transfert usine ${m.data.usineSource}`
                : ''}
          </span>
        ) : (
          <span className="text-[#B42318]">Commande introuvable dans SAP</span>
        )
      ) : null}
    </div>
  );
}
