import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface RecuCaisse {
  id: string;
  numero: string;
  caisseId: string;
  deviseId: string;
  montant: string;
  /** Partagé avec l'opération qui l'a produit : c'est ce qui les relie. */
  transactionUuid: string;
  typeEntree?: string | null;
  remisPar?: string | null;
  motif?: string | null;
  createdAt: string;
  /** Libellés résolus par le serveur — l'impression ne recompose rien. */
  caisseLibelle?: string | null;
  deviseCode?: string | null;
  encaissePar?: string | null;
}

export async function listRecusCaisse(caisseId?: string, limit = 100): Promise<RecuCaisse[]> {
  const { data } = await api.get<RecuCaisse[]>('/recus-caisse', {
    // Filtré EN BASE : une caisse peut totaliser des milliers de reçus.
    params: { ...(caisseId ? { caisseId } : {}), limit },
  });
  return data;
}

export function useRecusCaisse(caisseId?: string, limit = 100) {
  return useQuery({
    queryKey: ['recus-caisse', caisseId ?? 'tous', limit],
    queryFn: () => listRecusCaisse(caisseId, limit),
  });
}

const LIBELLE_ENTREE: Record<string, string> = {
  REMBOURSEMENT_BON: "Retour d'un bon non dépensé",
  ENCAISSEMENT: 'Encaissement',
  AJUSTEMENT: 'Ajustement de budget',
  RECHARGE: 'Recharge',
  TRANSFERT: 'Transfert',
  REMBOURSEMENT_CREDIT: 'Remboursement de crédit',
  SALAIRE: 'Salaire',
  CREDIT: 'Crédit',
};

/**
 * Ouvre le reçu dans une fenêtre d'impression.
 *
 * Même facture que le bon : en-tête NPG, numéro, et DEUX signatures — celui qui
 * remet et celui qui reçoit. Un reçu qu'une seule partie signe ne prouve rien.
 */
export function imprimerRecu(recu: RecuCaisse): boolean {
  const montant = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2 }).format(
    Number(recu.montant),
  );
  const nature = LIBELLE_ENTREE[recu.typeEntree ?? ''] ?? recu.typeEntree ?? 'Entrée en caisse';
  const esc = (v?: string | null) =>
    (v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

  const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8" /><title>Reçu ${esc(recu.numero)}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'Helvetica Neue',Arial,sans-serif;color:#0F172A;padding:32px;font-size:12px;}
  .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #0F4C81;padding-bottom:16px;margin-bottom:20px;}
  .brand{font-weight:700;color:#0F4C81;font-size:18px;}
  .sub{color:#64748B;font-size:11px;margin-top:2px;}
  .meta{text-align:right;font-size:11px;color:#64748B;}
  h1{font-size:22px;color:#0F4C81;margin-bottom:4px;}
  .infos{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:22px 0;}
  .info-label{font-size:10px;text-transform:uppercase;letter-spacing:.7px;color:#64748B;margin-bottom:2px;}
  .info-value{font-size:13px;font-weight:600;}
  .montant{margin:24px 0;display:flex;justify-content:center;}
  .montant-box{background:#0F4C81;color:#fff;padding:14px 28px;border-radius:8px;font-weight:700;font-size:20px;}
  .sign{margin-top:56px;display:grid;grid-template-columns:1fr 1fr;gap:48px;}
  .sign-box{border-top:1px solid #94A3B8;padding-top:6px;font-size:11px;color:#64748B;}
  .footer{margin-top:32px;text-align:center;color:#94A3B8;font-size:10px;}
  @media print { body { padding:20px; } }
</style></head><body>
  <div class="head">
    <div>
      <div class="brand">Fond de Caisse — NPG Gandour</div>
      <div class="sub">Reçu de réception</div>
    </div>
    <div class="meta">Émis le ${new Date(recu.createdAt).toLocaleString('fr-FR')}</div>
  </div>

  <h1>Reçu n° ${esc(recu.numero)}</h1>
  <div class="sub">${esc(nature)}</div>

  <div class="montant"><div class="montant-box">${montant} ${esc(recu.deviseCode)}</div></div>

  <div class="infos">
    <div><div class="info-label">Caisse</div><div class="info-value">${esc(recu.caisseLibelle)}</div></div>
    <div><div class="info-label">Reçu par</div><div class="info-value">${esc(recu.encaissePar) || '—'}</div></div>
    <div><div class="info-label">Remis par</div><div class="info-value">${esc(recu.remisPar) || '—'}</div></div>
    <div><div class="info-label">Motif</div><div class="info-value">${esc(recu.motif) || '—'}</div></div>
  </div>

  <div class="sign">
    <div class="sign-box">Signature de la personne qui remet</div>
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
