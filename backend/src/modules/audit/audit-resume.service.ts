import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { JournalAudit } from './entities/journal.entity';

/**
 * Traduit une ligne d'audit en PHRASE FRANÇAISE.
 *
 * Le journal stocke des identifiants : « users / roles / {"roles":"1"} ». C'est
 * exact et compact, mais illisible — un auditeur ne sait pas qui est le rôle 1.
 * Ce service résout les identifiants en noms et compose « a attribué le rôle
 * Caissier à Lorène Touré ».
 *
 * Le JSON d'origine n'est JAMAIS remplacé : il reste exposé à côté du résumé.
 * Un journal d'audit ne doit rien perdre — le résumé est une lecture, pas une
 * substitution.
 *
 * Les libellés sont résolus par LOT : une requête par table pour toute la page,
 * quel que soit le nombre de lignes.
 */

/** Table + expression de libellé, par ressource d'URL et par clé de corps JSON. */
const CIBLES: Record<string, { table: string; label: string }> = {
  users: { table: 'sec_user', label: "prenom + ' ' + nom" },
  userId: { table: 'sec_user', label: "prenom + ' ' + nom" },
  demandeurId: { table: 'sec_user', label: "prenom + ' ' + nom" },
  roles: { table: 'sec_role', label: 'libelle' },
  roleId: { table: 'sec_role', label: 'libelle' },
  profils: { table: 'sec_profil', label: 'libelle' },
  profilId: { table: 'sec_profil', label: 'libelle' },
  permissions: { table: 'sec_permission', label: 'code' },
  permissionId: { table: 'sec_permission', label: 'code' },
  directions: { table: 'sec_direction', label: 'libelle' },
  directionId: { table: 'sec_direction', label: 'libelle' },
  interims: { table: 'sec_interim', label: "CAST(id AS nvarchar(20))" },
  caisses: { table: 'fin_caisse', label: 'code' },
  caisseId: { table: 'fin_caisse', label: 'code' },
  portefeuilles: { table: 'fin_portefeuille', label: 'code' },
  portefeuilleId: { table: 'fin_portefeuille', label: 'code' },
  deviseId: { table: 'fin_devise', label: 'code' },
  partenaires: { table: 'ref_partenaire', label: 'raison_sociale' },
  partenaireId: { table: 'ref_partenaire', label: 'raison_sociale' },
  'cost-centers': { table: 'ref_cost_center', label: 'libelle' },
  costCenterId: { table: 'ref_cost_center', label: 'libelle' },
  'natures-operation': { table: 'ref_nature_operation', label: 'libelle' },
  natureOperationId: { table: 'ref_nature_operation', label: 'libelle' },
  employes: { table: 'ref_employe', label: "nom + ' ' + prenoms" },
  employeId: { table: 'ref_employe', label: "nom + ' ' + prenoms" },
  'types-benefice': { table: 'ref_type_benefice', label: 'libelle' },
  bons: { table: 'trx_bon', label: 'numero' },
  bonId: { table: 'trx_bon', label: 'numero' },
  'bons-manuels': { table: 'trx_bon_manuel', label: 'numero' },
  // `trx_bon_caisse` n'a pas de numéro propre : il ajuste un bon existant.
  'bons-caisse': { table: 'trx_bon_caisse', label: 'libelle_ajuste' },
  carnets: { table: 'trx_carnet', label: 'libelle' },
  'demandes-recharge': { table: 'fin_demande_recharge', label: 'numero' },
  'demandes-transfert': { table: 'fin_demande_transfert', label: 'numero' },
  credits: { table: 'fin_credit', label: "CAST(id AS nvarchar(20))" },
  pays: { table: 'ref_pays', label: 'libelle' },
  'plan-comptable': { table: 'ref_plan_comptable', label: "numero_compte + ' — ' + libelle" },
  salaires: { table: 'fin_paiement_salaire', label: 'periode' },
};

/** Comment nommer la ressource visée, avec son article. */
const NOM_RESSOURCE: Record<string, string> = {
  users: "l'utilisateur",
  roles: 'le rôle',
  profils: 'le profil',
  directions: 'la direction',
  interims: "l'intérim",
  caisses: 'la caisse',
  portefeuilles: 'le portefeuille',
  partenaires: 'le partenaire',
  'cost-centers': 'le centre de coût',
  'natures-operation': "la nature d'opération",
  'plan-comptable': 'le compte',
  employes: "l'employé",
  'types-benefice': 'le type de bénéfice',
  benefices: 'le bénéfice',
  bons: 'le bon',
  'bons-manuels': 'le bon manuel',
  'bons-caisse': 'le bon de caisse',
  encaissements: "l'encaissement",
  recharges: 'la recharge',
  'demandes-recharge': 'la demande de recharge',
  'demandes-transfert': 'la demande de transfert',
  credits: 'le crédit',
  'paiements-salaire': 'le paiement de salaire',
  'taux-change': 'le taux de change',
  parametres: 'le paramètre',
  sap: 'SAP',
  pays: 'le pays',
  salaires: 'le paiement de salaire',
  carnets: 'le carnet',
};

/** Verbes, au passé composé sans sujet — la colonne « Utilisateur » le porte déjà. */
const VERBE: Record<string, string> = {
  CREER: 'a créé',
  MODIFIER: 'a modifié',
  SUPPRIMER: 'a supprimé',
  ouvrir: 'a ouvert',
  cloturer: 'a clôturé',
  valider: 'a validé',
  decaisser: 'a décaissé',
  comptabiliser: 'a comptabilisé',
  annuler: 'a annulé',
  approuver: 'a approuvé',
  rejeter: 'a rejeté',
  traiter: 'a traité',
  executer: 'a exécuté',
  solder: 'a soldé',
  importer: 'a importé',
  reactiver: 'a réactivé',
  revoke: 'a révoqué',
  'toggle-active': 'a activé ou désactivé',
  payer: 'a payé',
  // Sous-actions dont le segment d'URL est resté en anglais. Elles n'ont pas à
  // remonter telles quelles dans un journal destiné à être lu.
  validate: 'a validé',
  cancel: 'a annulé',
  decision: 'a statué sur',
  finalize: 'a finalisé',
  print: 'a imprimé',
  sign: 'a signé',
  extension: "a demandé l'extension de",
  salaires: 'a modifié le salaire de',
  benefices: 'a accordé un bénéfice à',
  remboursements: 'a enregistré un remboursement sur',
  'sync/comptes': 'a synchronisé les comptes',
  'sync/clients': 'a synchronisé les clients',
  'sync/fournisseurs': 'a synchronisé les fournisseurs',
  'ecriture/post': 'a envoyé une écriture à',
  'ecriture/check': 'a contrôlé une écriture sur',
  'ecriture/contrepasser': 'a contrepassé une écriture sur',
};

/** Une ligne d'audit, augmentée de sa lecture en clair. */
export type LigneAuditVue = JournalAudit & { resume: string };

@Injectable()
export class AuditResumeService {
  constructor(private readonly dataSource: DataSource) {}

  async enrichir(lignes: JournalAudit[]): Promise<LigneAuditVue[]> {
    const aResoudre = new Map<string, Set<string>>();
    const noter = (cle: string, id: unknown) => {
      const cible = CIBLES[cle];
      const valeur = String(id ?? '');
      if (!cible || !/^\d+$/.test(valeur)) return;
      if (!aResoudre.has(cible.table)) aResoudre.set(cible.table, new Set());
      aResoudre.get(cible.table)!.add(valeur);
    };

    // 1) Recenser tous les identifiants à traduire, sur toute la page.
    const corps = lignes.map((l) => this.parse(l.nouvelleValeur));
    lignes.forEach((l, i) => {
      noter(l.entiteConcernee, l.entiteId);
      for (const [k, v] of Object.entries(corps[i] ?? {})) noter(k, v);
    });

    // 2) Une requête par table, pas une par ligne.
    const libelles = new Map<string, string>();
    for (const [table, ids] of aResoudre) {
      const cible = Object.values(CIBLES).find((c) => c.table === table)!;
      try {
        const rows: Array<{ id: string | number; label: string | null }> =
          await this.dataSource.query(
            `SELECT id, ${cible.label} AS label FROM dbo.${table} WHERE id IN (${[...ids].join(',')})`,
          );
        for (const r of rows) {
          if (r.label) libelles.set(`${table}#${r.id}`, String(r.label).trim());
        }
      } catch {
        // Une table absente ou renommée ne doit pas priver l'écran de ses lignes.
      }
    }

    const nom = (cle: string, id: unknown): string | null => {
      const cible = CIBLES[cle];
      if (!cible) return null;
      return libelles.get(`${cible.table}#${String(id ?? '')}`) ?? null;
    };

    return lignes.map((l, i) => ({ ...l, resume: this.composer(l, corps[i], nom) }));
  }

  /**
   * Compose la phrase. L'ordre des cas suit leur fréquence dans le journal :
   * l'attribution de rôles y est de loin la plus courante (274 lignes sur 800).
   */
  private composer(
    l: JournalAudit,
    corps: Record<string, unknown> | null,
    nom: (cle: string, id: unknown) => string | null,
  ): string {
    const verbe = VERBE[l.action] ?? `a effectué « ${l.action} » sur`;
    const ressource = NOM_RESSOURCE[l.entiteConcernee] ?? l.entiteConcernee;
    const cibleNom = nom(l.entiteConcernee, l.entiteId);
    const cible = cibleNom ? `${ressource} ${cibleNom}` : l.entiteId ? `${ressource} #${l.entiteId}` : ressource;

    // Attache / détache : « a attribué le rôle Caissier à l'utilisateur X ».
    if (corps && typeof corps.op === 'string') {
      const cleLiee = Object.keys(corps).find((k) => k !== 'op' && CIBLES[k]);
      if (cleLiee) {
        const lie = nom(cleLiee, corps[cleLiee]) ?? `#${corps[cleLiee]}`;
        const quoi = NOM_RESSOURCE[cleLiee] ?? cleLiee;
        return corps.op === 'retrait'
          ? `a retiré ${quoi} ${lie} à ${cible}`
          : `a attribué ${quoi} ${lie} à ${cible}`;
      }
    }

    const details: string[] = [];
    if (corps) {
      // Montant : l'information qui compte en premier sur un mouvement d'argent.
      const montant = corps.montant ?? corps.montantTotal;
      if (montant != null && montant !== '') {
        const devise = nom('deviseId', corps.deviseId);
        details.push(`de ${montant}${devise ? ` ${devise}` : ''}`);
      }
      for (const cle of ['caisseId', 'portefeuilleId', 'employeId', 'partenaireId']) {
        const n = nom(cle, corps[cle]);
        if (n) details.push(`${NOM_RESSOURCE[cle.replace(/Id$/, 's')] ?? ''} ${n}`.trim());
      }
      if (typeof corps.motif === 'string' && corps.motif.trim()) {
        details.push(`« ${corps.motif.trim().slice(0, 60)} »`);
      }
    }

    return details.length > 0 ? `${verbe} ${cible} — ${details.join(', ')}` : `${verbe} ${cible}`;
  }

  private parse(json: string | null | undefined): Record<string, unknown> | null {
    if (!json) return null;
    try {
      const o = JSON.parse(json);
      return o && typeof o === 'object' ? (o as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
}
