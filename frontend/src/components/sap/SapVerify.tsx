import { useEffect, useRef, useState } from 'react';
import { useVerifierClientSap, useVerifierCommandeSap } from '@/api/sap';

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

/**
 * Vérification AUTOMATIQUE d'un code client dans SAP : dès que `code` change
 * (après une courte pause), interroge SAP et auto-remplit le nom via `onResolved`.
 */
export function SapClientVerify({ code, onResolved }: { code: string; onResolved: (nom: string) => void }) {
  const m = useVerifierClientSap();
  const [debounced, setDebounced] = useState('');
  const lastRef = useRef<string>('');
  const resolvedRef = useRef(onResolved);
  resolvedRef.current = onResolved;

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
