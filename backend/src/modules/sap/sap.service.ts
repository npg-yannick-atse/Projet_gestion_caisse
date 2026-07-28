import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PosterPieceDto } from './dto/poster-piece.dto';

/**
 * Chargement PARESSEUX de node-rfc (dépendance native optionnelle).
 * Le nom du module est en variable → TypeScript ne tente pas de le résoudre à la
 * compilation : l'application compile et démarre même si node-rfc / le SAP NWRFC
 * SDK ne sont pas encore installés. Dans ce cas, les endpoints SAP renvoient une
 * erreur explicite (503) au lieu de faire planter le boot.
 */
const NODE_RFC_MODULE = 'node-rfc';
let nodeRfc: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  nodeRfc = require(NODE_RFC_MODULE);
} catch {
  nodeRfc = null;
}

export interface SapClientInfo {
  code: string;
  existe: boolean;
  nom?: string;
  ville?: string;
  pays?: string;
  identifiantFiscal?: string;
  telephone?: string;
  messages: string[];
  details?: Record<string, unknown>;
}

export interface SapCommandeInfo {
  numero: string;
  existe: boolean;
  fournisseur?: string;
  /** Raison sociale du fournisseur (résolue via BAPI_VENDOR_GETDETAIL, best-effort). */
  fournisseurNom?: string;
  /** Usine source (SUPPL_PLNT) pour un ordre de transfert de stock (DOC_TYPE UB). */
  usineSource?: string;
  societe?: string;
  devise?: string;
  /** Type de document SAP : NB = achat, UB = transfert de stock, etc. */
  typeDocument?: string;
  dateDocument?: string;
  statut?: string;
  /** Conditions de paiement (PMNTTRMS). */
  conditionsPaiement?: string;
  messages: string[];
  details?: Record<string, unknown>;
}

export interface SapPosteResult {
  ok: boolean;
  /** true = contrôle sans écriture (BAPI_ACC_DOCUMENT_CHECK). */
  dryRun: boolean;
  /** Numéro de pièce SAP (OBJ_KEY) en cas de POST réussi. */
  numeroPiece?: string;
  messages: string[];
  details?: Record<string, unknown>;
}

/** Types d'opération transmis à SAP (les mouvements internes en sont exclus). */
const TYPES_ENVOYABLES = ['ENCAISSEMENT', 'DECAISSEMENT', 'CREDIT'];

@Injectable()
export class SapService {
  private readonly logger = new Logger(SapService.name);

  constructor(private readonly dataSource: DataSource) {}

  /** Paramètres de connexion, lus dans l'environnement (mêmes noms que sap.env). */
  private connectionParams(): Record<string, string> {
    const { SAP_ASHOST, SAP_SYSNR, SAP_CLIENT, SAP_USER, SAP_PASSWD, SAP_LANG } = process.env;
    if (!SAP_ASHOST || !SAP_SYSNR || !SAP_CLIENT || !SAP_USER) {
      throw new ServiceUnavailableException(
        'Configuration SAP incomplète (SAP_ASHOST / SAP_SYSNR / SAP_CLIENT / SAP_USER requis).',
      );
    }
    return {
      ashost: SAP_ASHOST,
      sysnr: SAP_SYSNR,
      client: SAP_CLIENT,
      user: SAP_USER,
      passwd: SAP_PASSWD ?? '',
      lang: SAP_LANG ?? 'FR',
    };
  }

  /** Ouvre une connexion, exécute `fn`, ferme toujours. Traduit les erreurs en 503. */
  private async withClient<T>(fn: (client: any) => Promise<T>): Promise<T> {
    if (!nodeRfc?.Client) {
      throw new ServiceUnavailableException(
        "Connecteur SAP (node-rfc) non installé sur le serveur. Faire : npm install node-rfc (+ SAP NWRFC SDK).",
      );
    }
    const client = new nodeRfc.Client(this.connectionParams());
    try {
      await client.open();
      return await fn(client);
    } catch (e: any) {
      this.logger.warn(`Appel SAP échoué : ${e?.message ?? e}`);
      throw new ServiceUnavailableException(`SAP : ${e?.message ?? 'erreur de communication'}`);
    } finally {
      try {
        await client.close();
      } catch {
        /* connexion déjà fermée : sans importance */
      }
    }
  }

  /** Extrait les messages d'une table/structure RETURN (BAPIRET2). */
  private messagesFromReturn(ret: any): string[] {
    if (!ret) return [];
    const rows = Array.isArray(ret) ? ret : [ret];
    return rows.filter((r: any) => r?.MESSAGE).map((r: any) => `[${r.TYPE}] ${String(r.MESSAGE).trim()}`);
  }

  private hasError(messages: string[]): boolean {
    return messages.some((m) => m.startsWith('[E]') || m.startsWith('[A]'));
  }

  /**
   * Aplati récursivement la réponse SAP en {chemin: valeur} pour les scalaires
   * non vides (hors RETURN) → permet de VOIR tous les champs réellement renvoyés
   * et d'identifier les bons noms (nom client, etc.) pendant les tests.
   */
  private flatten(obj: any, prefix = ''): Record<string, string> {
    const out: Record<string, string> = {};
    if (obj == null) return out;
    if (Array.isArray(obj)) {
      obj.forEach((v, i) => Object.assign(out, this.flatten(v, `${prefix}[${i}]`)));
    } else if (typeof obj === 'object') {
      for (const [k, v] of Object.entries(obj)) {
        if (k === 'RETURN') continue;
        Object.assign(out, this.flatten(v, prefix ? `${prefix}.${k}` : k));
      }
    } else {
      const s = String(obj).trim();
      if (s !== '') out[prefix] = s;
    }
    return out;
  }

  /** Premier champ non vide parmi une liste de noms possibles (sur un objet plat ou non). */
  private pick(obj: Record<string, any>, ...names: string[]): string | undefined {
    for (const n of names) {
      const v = obj?.[n];
      if (v != null && String(v).trim() !== '') return String(v).trim();
    }
    return undefined;
  }

  /** Test de connectivité (STFC_CONNECTION). */
  async ping(): Promise<{ ok: boolean; message: string }> {
    return this.withClient(async (c) => {
      const r = await c.call('STFC_CONNECTION', { REQUTEXT: 'Ping Fond de Caisse' });
      return { ok: true, message: String(r?.RESPTEXT ?? 'OK').trim() };
    });
  }

  /** Vérifie un client par son code (KUNNR) et récupère nom / ville / pays. */
  async verifierClient(code: string): Promise<SapClientInfo> {
    const kunnr = /^\d+$/.test(code) ? code.padStart(10, '0') : code;
    return this.withClient(async (c) => {
      const r = await c.call('BAPI_CUSTOMER_GETDETAIL2', { CUSTOMERNO: kunnr });
      // BAPI_CUSTOMER_GETDETAIL2 renvoie l'adresse dans CUSTOMERADDRESS (nom, ville,
      // pays…) et les infos générales dans CUSTOMERGENERALDETAIL (groupe, n° TVA…).
      const addr = (r?.CUSTOMERADDRESS ?? r?.PE_ADDRESS ?? {}) as Record<string, any>;
      const gen = (r?.CUSTOMERGENERALDETAIL ?? {}) as Record<string, any>;
      const messages = this.messagesFromReturn(r?.RETURN);
      // L'existence dépend de l'ABSENCE d'erreur SAP (un message [I]/[S] confirme
      // au contraire que le client existe), pas de la présence d'un nom.
      return {
        code: kunnr,
        existe: !this.hasError(messages),
        nom: this.pick(addr, 'NAME', 'NAME_1', 'NAME_2'),
        ville: this.pick(addr, 'CITY', 'CITY1'),
        pays: this.pick(addr, 'COUNTRY', 'COUNTRYISO'),
        identifiantFiscal: this.pick(gen, 'VAT_REG_NO', 'TAX_NO_5', 'TAX_NO_1'),
        telephone: this.pick(addr, 'TELEPHONE', 'TELEPHONE2'),
        messages,
        details: this.flatten(r),
      };
    });
  }

  /**
   * Récupère la raison sociale d'un fournisseur (best-effort). Réutilise la
   * connexion ouverte. Tolérant : si la BAPI n'existe pas / n'est pas autorisée,
   * renvoie undefined sans casser la vérification de la commande.
   */
  private async resolveVendorName(client: any, vendor: string): Promise<string | undefined> {
    const lifnr = /^\d+$/.test(vendor) ? vendor.padStart(10, '0') : vendor;
    try {
      const v = await client.call('BAPI_VENDOR_GETDETAIL', { VENDORNO: lifnr });
      const flat = this.flatten(v);
      // Cherche le premier champ « nom » (NAME / NAME1 / NAME_1…).
      const key = Object.keys(flat).find((k) => /(^|\.)NAME(_?1)?$/i.test(k)) ?? Object.keys(flat).find((k) => /NAME/i.test(k));
      return key ? flat[key] : undefined;
    } catch {
      return undefined;
    }
  }

  /** Vérifie une commande d'achat par son numéro (EBELN) et récupère fournisseur / société. */
  async verifierCommande(numero: string): Promise<SapCommandeInfo> {
    const ebeln = /^\d+$/.test(numero) ? numero.padStart(10, '0') : numero;
    return this.withClient(async (c) => {
      const r = await c.call('BAPI_PO_GETDETAIL1', { PURCHASEORDER: ebeln });
      const h = (r?.POHEADER ?? {}) as Record<string, any>;
      const messages = this.messagesFromReturn(r?.RETURN);
      const fournisseur = this.pick(h, 'VENDOR', 'SUPPLIER', 'LIFNR');
      // Résolution best-effort du nom fournisseur (2e appel, même connexion).
      const fournisseurNom = fournisseur ? await this.resolveVendorName(c, fournisseur) : undefined;
      return {
        numero: this.pick(h, 'PO_NUMBER') ?? ebeln,
        existe: !this.hasError(messages),
        fournisseur,
        fournisseurNom,
        usineSource: this.pick(h, 'SUPPL_PLNT'),
        societe: this.pick(h, 'COMP_CODE', 'CO_CODE', 'BUKRS'),
        devise: this.pick(h, 'CURRENCY', 'CURRENCY_ISO', 'WAERS'),
        typeDocument: this.pick(h, 'DOC_TYPE'),
        dateDocument: this.pick(h, 'DOC_DATE'),
        statut: this.pick(h, 'STATUS'),
        conditionsPaiement: this.pick(h, 'PMNTTRMS', 'PYMT_METH'),
        messages,
        details: this.flatten(r),
      };
    });
  }

  /**
   * Liste des comptes généraux postables d'une société (lecture de SKB1) avec
   * leur libellé (SKAT, plan PCGG, français). Sert à choisir de vrais comptes
   * pour tester le posting. Via RFC_READ_TABLE (peut nécessiter une autorisation).
   */
  async getComptes(recherche?: string, bukrs = '2251'): Promise<Array<{ compte: string; libelle?: string }>> {
    return this.withClient(async (c) => {
      const q = (recherche ?? '').trim();
      const estNumero = /^\d+$/.test(q);
      // Comptes de la société : on POUSSE le filtre numéro dans SAP (SAKNR LIKE) pour
      // ne pas être limité aux premiers comptes ; sinon on charge large et on filtre.
      const skb1Options: Array<{ TEXT: string }> = [{ TEXT: `BUKRS EQ '${bukrs}'` }];
      if (q && estNumero) skb1Options.push({ TEXT: `AND SAKNR LIKE '%${q}%'` });
      let skb1: any;
      try {
        skb1 = await c.call('RFC_READ_TABLE', {
          QUERY_TABLE: 'SKB1',
          DELIMITER: '|',
          ROWCOUNT: 3000,
          FIELDS: [{ FIELDNAME: 'SAKNR' }],
          OPTIONS: skb1Options,
        });
      } catch (e: any) {
        throw new ServiceUnavailableException(
          `Lecture des comptes (RFC_READ_TABLE) refusée : ${e?.message ?? 'non autorisée'}. Demander les comptes à l'équipe SAP.`,
        );
      }
      const comptes: string[] = (skb1?.DATA ?? []).map((d: any) => String(d.WA).split('|')[0].trim());

      // Libellés (best-effort) depuis SKAT (plan PCGG, langue F).
      const noms = new Map<string, string>();
      try {
        const skat = await c.call('RFC_READ_TABLE', {
          QUERY_TABLE: 'SKAT',
          DELIMITER: '|',
          ROWCOUNT: 9000,
          FIELDS: [{ FIELDNAME: 'SAKNR' }, { FIELDNAME: 'TXT50' }],
          OPTIONS: [{ TEXT: `KTOPL EQ 'PCGG'` }, { TEXT: `AND SPRAS EQ 'F'` }],
        });
        for (const d of skat?.DATA ?? []) {
          const [s, t] = String(d.WA).split('|');
          noms.set((s ?? '').trim(), (t ?? '').trim());
        }
      } catch {
        /* libellés indisponibles : on renvoie au moins les numéros */
      }

      let out = comptes.map((s) => ({ compte: s.replace(/^0+/, '') || s, libelle: noms.get(s) || undefined }));
      if (recherche && recherche.trim()) {
        const q = recherche.trim().toLowerCase();
        out = out.filter((x) => x.compte.toLowerCase().includes(q) || (x.libelle ?? '').toLowerCase().includes(q));
      }
      return out.slice(0, 60);
    });
  }

  /* ============================ POSTING (écriture) ============================ */

  /** Normalise une date en AAAAMMJJ (accepte AAAA-MM-JJ). Défaut : aujourd'hui. */
  private toSapDate(d?: string): string {
    if (d && /^\d{8}$/.test(d)) return d;
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d.replace(/-/g, '');
    const now = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}`;
  }

  /** Construit les structures BAPI_ACC_DOCUMENT_* à partir d'une pièce métier. */
  private buildPiece(dto: PosterPieceDto): Record<string, unknown> {
    const header = {
      USERNAME: process.env.SAP_USER,
      HEADER_TXT: dto.texte ?? 'Fond de Caisse',
      COMP_CODE: dto.societe,
      DOC_DATE: this.toSapDate(dto.datePiece),
      PSTNG_DATE: this.toSapDate(dto.dateComptable ?? dto.datePiece),
      DOC_TYPE: dto.typePiece || 'SA',
      REF_DOC_NO: dto.reference ?? '',
      BUS_ACT: 'RFBU',
    };
    const accountgl: Record<string, unknown>[] = [];
    const currencyamount: Record<string, unknown>[] = [];
    dto.lignes.forEach((l, i) => {
      const item = String(i + 1);
      const gl = /^\d+$/.test(l.compteGL) ? l.compteGL.padStart(10, '0') : l.compteGL;
      // Certains comptes exigent un texte de ligne (ITEM_TEXT) : on garantit une
      // valeur non vide (libellé saisi, sinon référence, sinon défaut).
      const itemText = (l.texte && l.texte.trim()) || dto.reference || dto.texte || 'Fond de Caisse';
      accountgl.push({ ITEMNO_ACC: item, GL_ACCOUNT: gl, ITEM_TEXT: itemText.slice(0, 50), COSTCENTER: l.centreCout ?? '' });
      // Convention BAPI : débit positif, crédit négatif.
      currencyamount.push({
        ITEMNO_ACC: item,
        CURR_TYPE: '00',
        CURRENCY: dto.devise,
        AMT_DOCCUR: l.sens === 'D' ? l.montant : -l.montant,
      });
    });
    return { DOCUMENTHEADER: header, ACCOUNTGL: accountgl, CURRENCYAMOUNT: currencyamount };
  }

  /** Contrôle une pièce SANS l'écrire (BAPI_ACC_DOCUMENT_CHECK). Sûr. */
  async checkPiece(dto: PosterPieceDto): Promise<SapPosteResult> {
    return this.envoyerPiece(dto, true);
  }

  /** Poste réellement une pièce (BAPI_ACC_DOCUMENT_POST + COMMIT). Écrit en SAP. */
  async posterPiece(dto: PosterPieceDto): Promise<SapPosteResult> {
    return this.envoyerPiece(dto, false);
  }

  /**
   * Contrepasse (annule) une pièce déjà postée via BAPI_ACC_DOCUMENT_REV_POST.
   * `objKey` = le numéro renvoyé au POST (BELNR+BUKRS+GJAHR, 18 car.).
   */
  async contrepasser(objKey: string, motif = '01'): Promise<SapPosteResult> {
    return this.withClient(async (c) => {
      const r = await c.call('BAPI_ACC_DOCUMENT_REV_POST', {
        REVERSAL: {
          OBJ_TYPE: 'BKPFF',
          OBJ_KEY: objKey,
          OBJ_SYS: '',
          PSTNG_DATE: this.toSapDate(),
          REASON_REV: motif,
        },
        BUS_ACT: 'RFBU',
      });
      const messages = this.messagesFromReturn(r?.RETURN);
      const erreur = this.hasError(messages);
      let numeroPiece: string | undefined;
      if (erreur) {
        try {
          await c.call('BAPI_TRANSACTION_ROLLBACK');
        } catch {
          /* rien à annuler */
        }
      } else {
        numeroPiece = this.pick(r ?? {}, 'OBJ_KEY');
        await c.call('BAPI_TRANSACTION_COMMIT', { WAIT: 'X' });
      }
      return { ok: !erreur, dryRun: false, numeroPiece, messages, details: this.flatten(r) };
    });
  }

  /* -------------------- Mapping comptable (type_compte → compte SAP) -------------------- */

  /** Retourne le mapping complet (pour l'admin). */
  async getMapping(): Promise<Array<{ typeCompte: string; compteSap: string | null }>> {
    const rows: any[] = await this.dataSource.query(
      `SELECT type_compte, compte_sap FROM dbo.sap_compte_mapping WHERE est_actif = 1 ORDER BY type_compte`,
    );
    return rows.map((r) => ({ typeCompte: r.type_compte, compteSap: r.compte_sap ?? null }));
  }

  /** Map {type_compte → compte SAP} (comptes renseignés seulement). */
  private async getMappingMap(): Promise<Map<string, string>> {
    const rows: any[] = await this.dataSource.query(
      `SELECT type_compte, compte_sap FROM dbo.sap_compte_mapping WHERE est_actif = 1 AND compte_sap IS NOT NULL AND compte_sap <> ''`,
    );
    return new Map(rows.map((r) => [r.type_compte as string, String(r.compte_sap).trim()]));
  }

  /** Définit (upsert) le compte SAP d'un type de compte. */
  async setMappingCompte(typeCompte: string, compteSap: string | null): Promise<Array<{ typeCompte: string; compteSap: string | null }>> {
    const tc = String(typeCompte || '').trim();
    if (!tc) throw new BadRequestException('type_compte requis.');
    const cs = compteSap && String(compteSap).trim() ? String(compteSap).trim() : null;
    const exists: any[] = await this.dataSource.query(`SELECT 1 FROM dbo.sap_compte_mapping WHERE type_compte = @0`, [tc]);
    if (exists.length) {
      await this.dataSource.query(
        `UPDATE dbo.sap_compte_mapping SET compte_sap = @1, updated_at = SYSUTCDATETIME() WHERE type_compte = @0`,
        [tc, cs],
      );
    } else {
      await this.dataSource.query(`INSERT INTO dbo.sap_compte_mapping (type_compte, compte_sap) VALUES (@0, @1)`, [tc, cs]);
    }
    return this.getMapping();
  }

  /* ---------------- Mapping des centres de coût (app → SAP) ---------------- */

  async getCostCenterMapping(): Promise<Array<{ costCenterApp: string; costCenterSap: string | null }>> {
    const rows: any[] = await this.dataSource.query(
      `SELECT cost_center_app, cost_center_sap FROM dbo.sap_cost_center_mapping WHERE est_actif = 1 ORDER BY cost_center_app`,
    );
    return rows.map((r) => ({ costCenterApp: r.cost_center_app, costCenterSap: r.cost_center_sap ?? null }));
  }

  private async getCostCenterMap(): Promise<Map<string, string>> {
    const rows: any[] = await this.dataSource.query(
      `SELECT cost_center_app, cost_center_sap FROM dbo.sap_cost_center_mapping WHERE est_actif = 1 AND cost_center_sap IS NOT NULL AND cost_center_sap <> ''`,
    );
    return new Map(rows.map((r) => [r.cost_center_app as string, String(r.cost_center_sap).trim()]));
  }

  async setCostCenterMapping(
    costCenterApp: string,
    costCenterSap: string | null,
  ): Promise<Array<{ costCenterApp: string; costCenterSap: string | null }>> {
    const a = String(costCenterApp || '').trim();
    if (!a) throw new BadRequestException('centre de coût (app) requis.');
    const s = costCenterSap && String(costCenterSap).trim() ? String(costCenterSap).trim() : null;
    const exists: any[] = await this.dataSource.query(
      `SELECT 1 FROM dbo.sap_cost_center_mapping WHERE cost_center_app = @0`,
      [a],
    );
    if (exists.length) {
      await this.dataSource.query(
        `UPDATE dbo.sap_cost_center_mapping SET cost_center_sap = @1, updated_at = SYSUTCDATETIME() WHERE cost_center_app = @0`,
        [a, s],
      );
    } else {
      await this.dataSource.query(
        `INSERT INTO dbo.sap_cost_center_mapping (cost_center_app, cost_center_sap) VALUES (@0, @1)`,
        [a, s],
      );
    }
    return this.getCostCenterMapping();
  }

  /**
   * Envoie une OPÉRATION de l'appli vers SAP : construit la pièce à partir de ses
   * écritures en partie double (compte = numero_compte du plan comptable, centre de
   * coût, débit/crédit), la poste, et trace le n° de pièce sur l'opération.
   * Idempotent : refuse si déjà envoyée. Les écritures sans compte du plan comptable
   * font échouer l'envoi (mapping comptable à configurer).
   */
  async envoyerOperation(operationId: string): Promise<SapPosteResult & { operationId: string }> {
    const id = Number(operationId);
    if (!Number.isInteger(id) || id <= 0) throw new BadRequestException('Identifiant opération invalide.');

    const [op] = await this.dataSource.query(
      `SELECT o.id, o.type_operation AS type, o.reference, o.sap_statut, o.sap_piece, d.code AS devise
         FROM dbo.trx_operation o
         LEFT JOIN dbo.fin_devise d ON d.id = o.devise_id
        WHERE o.id = @0`,
      [id],
    );
    if (!op) throw new NotFoundException(`Opération ${id} introuvable.`);
    if (op.sap_statut === 'ENVOYE' && op.sap_piece) {
      throw new ConflictException(`Opération déjà envoyée à SAP (pièce ${op.sap_piece}).`);
    }
    if (!TYPES_ENVOYABLES.includes(op.type)) {
      throw new BadRequestException(
        `Opération de type ${op.type} : mouvement interne non transmis à SAP (seuls ENCAISSEMENT, DECAISSEMENT, CREDIT le sont).`,
      );
    }

    const mapping = await this.getMappingMap();
    const ccMap = await this.getCostCenterMap();

    const ecr: any[] = await this.dataSource.query(
      `SELECT e.debit, e.credit, e.type_compte AS tc, cc.code AS cc
         FROM dbo.trx_ecriture_comptable e
         LEFT JOIN dbo.ref_cost_center cc ON cc.id = e.cost_center_id
        WHERE e.transaction_uuid = (SELECT transaction_uuid FROM dbo.trx_operation WHERE id = @0)
        ORDER BY e.id`,
      [id],
    );
    if (!ecr.length) throw new BadRequestException('Opération sans écritures comptables.');
    const nonMappes = [...new Set(ecr.map((e) => e.tc).filter((tc) => !mapping.get(tc)))];
    if (nonMappes.length) {
      throw new BadRequestException(
        `Types de compte non mappés : ${nonMappes.join(', ')}. Renseignez le mapping comptable (page SAP) avant l'envoi.`,
      );
    }

    const lignes = ecr.map((e) => {
      const credit = Number(e.credit ?? 0);
      const debit = Number(e.debit ?? 0);
      // Centre de coût : traduit app → SAP via le mapping ; si non mappé, on n'en
      // envoie pas (évite l'erreur « centre inexistant »).
      const centreCout = e.cc ? ccMap.get(e.cc) || undefined : undefined;
      // INVERSION débit/crédit : l'appli tient ses soldes en « crédit − débit »
      // (miroir de SAP). Un CRÉDIT app (argent entrant / contrepartie) = un DÉBIT
      // SAP, et inversement. Sans ça, la pièce SAP serait comptablement à l'envers.
      return {
        compteGL: String(mapping.get(e.tc)),
        sens: (credit > 0 ? 'D' : 'C') as 'C' | 'D',
        montant: credit > 0 ? credit : debit,
        texte: (op.reference || op.type || 'Fond de Caisse') as string,
        centreCout,
      };
    });

    const dto: PosterPieceDto = {
      societe: process.env.SAP_SOCIETE || '2251',
      devise: op.devise || 'XOF',
      typePiece: 'SA',
      reference: String(op.reference || `OP${id}`).slice(0, 16),
      texte: `FDC ${op.type}`.slice(0, 25),
      lignes,
    };

    let res: SapPosteResult;
    try {
      res = await this.posterPiece(dto);
    } catch (e: any) {
      await this.marquerOperation(id, 'ERREUR', null, String(e?.message ?? e));
      throw e;
    }
    if (res.ok && res.numeroPiece) {
      await this.marquerOperation(id, 'ENVOYE', res.numeroPiece, res.messages[0] ?? null);
    } else {
      await this.marquerOperation(id, 'ERREUR', null, res.messages.join(' | '));
    }
    return { ...res, operationId: String(id) };
  }

  private async marquerOperation(id: number, statut: string, piece: string | null, message: string | null) {
    await this.dataSource.query(
      `UPDATE dbo.trx_operation
          SET sap_statut = @1, sap_piece = @2, sap_message = @3, sap_date = SYSUTCDATETIME()
        WHERE id = @0`,
      [id, statut, piece, message ? message.slice(0, 500) : null],
    );
  }

  private async envoyerPiece(dto: PosterPieceDto, dryRun: boolean): Promise<SapPosteResult> {
    // Garde-fou : la pièce doit être équilibrée (Σdébit = Σcrédit).
    const balance = dto.lignes.reduce((a, l) => a + (l.sens === 'D' ? l.montant : -l.montant), 0);
    if (Math.abs(balance) > 0.0001) {
      throw new BadRequestException(`Pièce déséquilibrée : débit ≠ crédit (écart ${balance.toFixed(2)}).`);
    }
    const piece = this.buildPiece(dto);
    const fm = dryRun ? 'BAPI_ACC_DOCUMENT_CHECK' : 'BAPI_ACC_DOCUMENT_POST';
    return this.withClient(async (c) => {
      const r = await c.call(fm, piece);
      const messages = this.messagesFromReturn(r?.RETURN);
      const erreur = this.hasError(messages);
      let numeroPiece: string | undefined;
      if (!dryRun) {
        if (erreur) {
          try {
            await c.call('BAPI_TRANSACTION_ROLLBACK');
          } catch {
            /* rien à annuler */
          }
        } else {
          numeroPiece = this.pick(r ?? {}, 'OBJ_KEY');
          await c.call('BAPI_TRANSACTION_COMMIT', { WAIT: 'X' });
        }
      }
      return { ok: !erreur, dryRun, numeroPiece, messages, details: this.flatten(r) };
    });
  }
}
