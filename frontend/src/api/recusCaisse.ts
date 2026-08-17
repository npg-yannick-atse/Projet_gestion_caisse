import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { montantEnLettres } from '@/lib/montantEnLettres';

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
 * Ouvre le reçu dans une fenêtre d'impression — modèle CARNET À SOUCHE.
 *
 * Une A4 coupée en deux dans la hauteur : la souche reste à la caisse, le volet
 * part avec la personne qui a remis l'argent. C'est la forme du reçu papier
 * qu'on utilise depuis toujours, et elle règle un problème que le format
 * pleine page ne réglait pas : le caissier gardait une copie seulement s'il
 * pensait à imprimer deux fois.
 *
 * LE MONTANT EST ÉCRIT EN TOUTES LETTRES. Ce n'est pas un ornement : « 30 000 »
 * se retouche d'un trait de stylo, « TRENTE MILLE FRANCS CFA » non.
 *
 * DEUX signatures — celui qui remet, celui qui reçoit. Un reçu qu'une seule
 * partie signe ne prouve rien.
 */
export function imprimerRecu(recu: RecuCaisse): boolean {
  const montant = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2 }).format(
    Number(recu.montant),
  );
  const enLettres = montantEnLettres(recu.montant, recu.deviseCode);
  const nature = LIBELLE_ENTREE[recu.typeEntree ?? ''] ?? recu.typeEntree ?? 'Entrée en caisse';
  const esc = (v?: string | null) =>
    (v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

  const date = new Date(recu.createdAt).toLocaleDateString('fr-FR');
  const heure = new Date(recu.createdAt).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  /* Deux volets sur une même A4, séparés par un trait de découpe. La souche —
     étroite — reste au carnet ; le volet part avec la personne. Les deux
     portent le MÊME numéro : c'est ce qui permet de les rapprocher plus tard. */
  const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8" /><title>Reçu ${esc(recu.numero)}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'Helvetica Neue',Arial,sans-serif;color:#0F172A;font-size:11px;padding:14mm 10mm;}
  .feuille{display:flex;gap:0;align-items:stretch;}
  .souche{width:32%;padding-right:6mm;}
  /* Le trait de découpe : pointillés, avec les ciseaux pour qu'on ne se
     demande pas de quel côté couper. */
  .coupe{position:relative;border-left:1px dashed #94A3B8;}
  .coupe::after{content:'\\2702';position:absolute;top:50%;left:-7px;background:#fff;color:#94A3B8;font-size:13px;padding:2px 0;}
  .volet{flex:1;padding-left:6mm;}
  .marque{font-weight:700;color:#0F4C81;font-size:13px;}
  .sous{color:#64748B;font-size:9px;margin-top:1px;}
  .num{font-family:'Courier New',monospace;font-weight:700;color:#0F4C81;font-size:15px;letter-spacing:1px;}
  .bloc{margin-top:8px;}
  .et{font-size:8px;text-transform:uppercase;letter-spacing:.6px;color:#94A3B8;}
  .val{font-size:12px;font-weight:600;margin-top:1px;}
  .lettres{border:1px solid #0F4C81;border-radius:4px;padding:7px 9px;margin-top:4px;font-weight:700;font-size:12px;line-height:1.45;text-transform:uppercase;}
  .chiffres{font-family:'Courier New',monospace;font-size:16px;font-weight:700;color:#0F4C81;margin-top:4px;}
  .ligne{border-bottom:1px dotted #94A3B8;height:15px;margin-top:2px;}
  .sign{display:flex;gap:14mm;margin-top:16px;}
  .sign div{flex:1;border-top:1px solid #94A3B8;padding-top:4px;font-size:9px;color:#64748B;}
  .pied{margin-top:10px;font-size:8px;color:#CBD5E1;}
  @media print{body{padding:10mm 8mm;}}
</style></head><body>
  <div class="feuille">

    <!-- SOUCHE : reste à la caisse -->
    <div class="souche">
      <div class="marque">NPG GANDOUR</div>
      <div class="sous">Souche — à conserver</div>
      <div class="bloc"><div class="num">${esc(recu.numero)}</div></div>
      <div class="bloc"><div class="et">Date</div><div class="val">${date} · ${heure}</div></div>
      <div class="bloc"><div class="et">Caisse</div><div class="val">${esc(recu.caisseLibelle)}</div></div>
      <div class="bloc"><div class="et">Montant</div>
        <div class="chiffres">${montant} ${esc(recu.deviseCode)}</div></div>
      <div class="bloc"><div class="et">Nature</div><div class="val">${esc(nature)}</div></div>
      <div class="bloc"><div class="et">Remis par</div>
        ${recu.remisPar ? `<div class="val">${esc(recu.remisPar)}</div>` : '<div class="ligne"></div>'}</div>
      <div class="bloc"><div class="et">Visa caissier</div><div class="ligne"></div></div>
    </div>

    <div class="coupe"></div>

    <!-- VOLET : remis à la personne -->
    <div class="volet">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #0F4C81;padding-bottom:7px;">
        <div>
          <div class="marque" style="font-size:16px;">NPG GANDOUR</div>
          <div class="sous">Fond de Caisse — Reçu de réception</div>
        </div>
        <div style="text-align:right;">
          <div class="num">${esc(recu.numero)}</div>
          <div class="sous">Abidjan, le ${date}</div>
        </div>
      </div>

      <div class="bloc" style="margin-top:12px;">
        <div class="et">Reçu de</div>
        ${recu.remisPar ? `<div class="val">${esc(recu.remisPar)}</div>` : '<div class="ligne"></div>'}
      </div>

      <div class="bloc">
        <div class="et">La somme de</div>
        <div class="lettres">${esc(enLettres)}</div>
        <div class="chiffres">soit ${montant} ${esc(recu.deviseCode)}</div>
      </div>

      <div class="bloc"><div class="et">Au titre de</div>
        <div class="val">${esc(nature)}${recu.motif ? ` — ${esc(recu.motif)}` : ''}</div></div>

      <div class="bloc"><div class="et">Encaissée dans</div>
        <div class="val">${esc(recu.caisseLibelle)}</div></div>

      <div class="sign">
        <div>Signature du remettant</div>
        <div>Le caissier${recu.encaissePar ? ` — ${esc(recu.encaissePar)}` : ''}</div>
      </div>

      <div class="pied">Fond de Caisse — NPG Gandour · reçu émis automatiquement, non modifiable</div>
    </div>
  </div>
  <script>window.addEventListener('load', () => { setTimeout(() => window.print(), 250); });</script>
</body></html>`;

  const w = window.open('', '_blank', 'width=900,height=1000');
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}
