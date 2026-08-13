import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, In, IsNull } from 'typeorm';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { Bon, BonStatut, ExtensionMode } from './entities/bon.entity';
import { SousBon } from './entities/sous-bon.entity';
import { ValidationBon } from './entities/validation-bon.entity';
import { ImpressionBon } from './entities/impression-bon.entity';
import { BonCaisse } from './entities/bon-caisse.entity';
import { Decaissement } from './entities/decaissement.entity';
import { Operation } from './entities/operation.entity';
import { EcritureComptable } from './entities/ecriture-comptable.entity';
import { estDateIso } from './recurrence';
import { LedgerService } from './ledger.service';
import { PushService } from '@modules/notifications/push.service';
import { User } from '@modules/security/entities/user.entity';
import { UserCostCenter } from '@modules/security/entities/user-cost-center.entity';
import { AuthorizationService } from '@modules/security/authorization.service';
import { CostCenter } from '@modules/referentiel/entities/cost-center.entity';
import { NatureOperation } from '@modules/referentiel/entities/nature-operation.entity';
import { TypeBon } from '@modules/referentiel/entities/type-bon.entity';
import { Caisse } from '@modules/financier/entities/caisse.entity';
import { Portefeuille } from '@modules/financier/entities/portefeuille.entity';
import { UpdateBonDto, UpdateSousBonDto } from './dto/update-bon.dto';

interface CreateBonInput {
  demandeurId: string;
  typeBonId: string;
  soubons: Array<{
    libelle: string;
    montant: string;
    partenaireId?: string | null;
    numeroBl: string;
    codeManutention: string;
    costCenterId: string;
    natureOperationId?: string | null;
    natureComptableId?: string | null;
    caisseId: string;
    portefeuilleId: string;
    deviseId: string;
    numeroClient?: string;
    nomClient?: string;
    paysId?: string;
    divisionId?: string;
    description?: string;
  }>;
  estRecurrent?: boolean;
  frequenceRecurrence?: 'MENSUEL' | 'TRIMESTRIEL' | 'SEMESTRIEL' | 'ANNUEL';
  /** Jour du premier rappel, AAAA-MM-JJ. Exigé si le bon est récurrent. */
  dateProchaineEcheance?: string;
  creeParInterimId?: string;
  demandeExtension?: boolean;
  descriptionExtension?: string;
  /** Personne qui se présentera à la caisse pour le retrait (texte libre, optionnel). */
  porteur?: string;
}

@Injectable()
export class BonsService {
  constructor(
    @InjectRepository(Bon)
    private readonly bonRepo: Repository<Bon>,
    @InjectRepository(SousBon)
    private readonly sousBonRepo: Repository<SousBon>,
    @InjectRepository(ValidationBon)
    private readonly validationBonRepo: Repository<ValidationBon>,
    @InjectRepository(ImpressionBon)
    private readonly impressionBonRepo: Repository<ImpressionBon>,
    @InjectRepository(BonCaisse)
    private readonly bonCaisseRepo: Repository<BonCaisse>,
    @InjectRepository(Decaissement)
    private readonly decaissementRepo: Repository<Decaissement>,
    @InjectRepository(Operation)
    private readonly operationRepo: Repository<Operation>,
    @InjectRepository(EcritureComptable)
    private readonly ecritureRepo: Repository<EcritureComptable>,
    private readonly dataSource: DataSource,
    private readonly authz: AuthorizationService,
    private readonly ledger: LedgerService,
    private readonly push: PushService,
  ) {}

  /**
   * Le pays déclaré sur un sous-bon doit être celui du CLIENT choisi.
   *
   * L'habilitation porte sur la division que l'utilisateur déclare, pas sur le
   * client réel : un agent habilité sur une division ivoirienne pouvait donc
   * créer un bon pour un client angolais en déclarant la Côte d'Ivoire. Le pays
   * du client n'était qu'une suggestion de l'écran, que rien n'empêchait de
   * modifier.
   *
   * Le rapprochement se fait sur le code ISO-2 (LAND1 de SAP), en une seule
   * requête. Un client dont le pays est inconnu ne bloque pas : on ne refuse
   * que sur une contradiction constatée, jamais sur une absence d'information.
   */
  private async assertPaysCoherentAvecClient(
    soubons: Array<{ numeroClient?: string; paysId?: string }>,
  ): Promise<void> {
    const aVerifier = soubons.filter(
      (sb) => sb.numeroClient && String(sb.numeroClient).trim() !== '' && sb.paysId,
    );
    if (aVerifier.length === 0) return;

    const numeros = [...new Set(aVerifier.map((sb) => String(sb.numeroClient).trim()))];
    const paysIds = [...new Set(aVerifier.map((sb) => String(sb.paysId)))];
    const phNum = numeros.map((_, i) => `@${i}`).join(', ');
    const phPays = paysIds.map((_, i) => `@${i}`).join(', ');

    const [clients, pays]: [
      Array<{ numero_client: string; raison_sociale: string; pays: string | null }>,
      Array<{ id: string; code: string; libelle: string }>,
    ] = await Promise.all([
      this.dataSource.query(
        `SELECT numero_client, raison_sociale, pays FROM dbo.ref_partenaire
         WHERE numero_client IN (${phNum}) AND deleted_at IS NULL`,
        numeros,
      ),
      this.dataSource.query(
        `SELECT id, code, libelle FROM dbo.ref_pays WHERE id IN (${phPays})`,
        paysIds,
      ),
    ]);

    const parNumero = new Map(clients.map((c) => [String(c.numero_client), c]));
    const parId = new Map(pays.map((p) => [String(p.id), p]));

    for (const sb of aVerifier) {
      const client = parNumero.get(String(sb.numeroClient).trim());
      const paysDeclare = parId.get(String(sb.paysId));
      if (!client?.pays || !paysDeclare) continue; // information manquante : on n'accuse pas
      if (String(client.pays).toUpperCase() !== String(paysDeclare.code).toUpperCase()) {
        throw new BadRequestException(
          `Le client « ${client.raison_sociale} » est enregistré en ${client.pays}, ` +
            `mais le bon déclare ${paysDeclare.code} (${paysDeclare.libelle}). ` +
            `Corrigez le pays, ou la fiche du client dans SAP.`,
        );
      }
    }
  }

  /**
   * Crée un bon avec ses sous-bons
   * Règle : si le demandeur est un signataire, le bon est auto-validé
   */
  async createBon(input: CreateBonInput, currentUserId: string): Promise<Bon> {
    if (!input.soubons || input.soubons.length === 0) {
      throw new BadRequestException('Un bon doit contenir au moins un sous-bon');
    }

    // Habilitation : permission BON_CREER (les admins passent). Bloque les comptes
    // sans droit — dont ceux SANS aucun rôle. Les permissions sont câblées aux rôles
    // via sec_role_permission (cf. seed / migration_role_permissions.sql).
    await this.authz.assertPermission(currentUserId, 'BON_CREER', 'créer un bon');

    // Cloisonnement : périmètre direction/CC + caisses + portefeuilles, et règle multi-CC.
    await this.enforceBonPerimeter(
      currentUserId,
      input.soubons.map((sb) => ({
        costCenterId: String(sb.costCenterId),
        caisseId: String(sb.caisseId),
        portefeuilleId: String(sb.portefeuilleId),
      })),
    );

    // Cohérence nature ↔ centre de coût : une nature d'opération rattachée à un
    // centre de coût l'IMPOSE. Les deux champs se choisissaient séparément, d'où
    // des couples contradictoires (la nature RECHARGE, du 22100-DSI, enregistrée
    // sur 22100 puis sur 1-DBTSI — cf. BON-0027 et BON-0028). L'écran verrouille
    // désormais le centre de coût ; ce contrôle ferme la porte côté API.
    const natureIds = [...new Set(input.soubons.map((sb) => String(sb.natureOperationId)).filter(Boolean))];
    if (natureIds.length > 0) {
      const natures = await this.dataSource
        .getRepository(NatureOperation)
        .find({ where: { id: In(natureIds) as any } });
      // Une nature peut désormais être rattachée à PLUSIEURS centres de coût
      // (migration 0066) : « imposer » devient « restreindre ». Le centre du
      // sous-bon doit figurer parmi ceux de la nature. Une nature n'en ayant
      // qu'un seul se comporte exactement comme avant — il reste le seul choix.
      const ph = natureIds.map((_, i) => `@${i}`).join(', ');
      const liens: Array<{ natureId: string; costCenterId: string }> = await this.dataSource.query(
        `SELECT nature_operation_id AS natureId, cost_center_id AS costCenterId
         FROM dbo.ref_nature_operation_cost_center
         WHERE nature_operation_id IN (${ph})`,
        natureIds,
      );
      const ccParNature = new Map<string, Set<string>>();
      for (const l of liens) {
        const cle = String(l.natureId);
        if (!ccParNature.has(cle)) ccParNature.set(cle, new Set());
        ccParNature.get(cle)!.add(String(l.costCenterId));
      }

      for (let i = 0; i < input.soubons.length; i++) {
        const sb = input.soubons[i];
        const autorises = ccParNature.get(String(sb.natureOperationId));
        // Aucune liaison = nature non rattachée : on n'impose rien, comme avant
        // pour une nature sans centre de coût.
        if (!autorises || autorises.size === 0) continue;
        if (!autorises.has(String(sb.costCenterId))) {
          const nature = natures.find((n) => String(n.id) === String(sb.natureOperationId));
          const nom = nature?.code ?? sb.natureOperationId;
          throw new BadRequestException(
            autorises.size === 1
              ? `Sous-bon ${i + 1} : la nature « ${nom} » impose son centre de coût. ` +
                `Le centre de coût transmis ne correspond pas.`
              : `Sous-bon ${i + 1} : la nature « ${nom} » n'autorise que ${autorises.size} centres de coût, ` +
                `et celui transmis n'en fait pas partie.`,
          );
        }
      }
    }

    // Restitution client : pays + division obligatoires, et l'utilisateur qui crée
    // doit avoir l'ACCÈS à la division choisie (sauf admin).
    const typeBon = await this.dataSource
      .getRepository(TypeBon)
      .findOne({ where: { id: input.typeBonId } });
    if (typeBon?.requiertNomClient) {
      for (const sb of input.soubons) {
        if (!sb.paysId || !sb.divisionId) {
          throw new BadRequestException('Pays et division sont requis pour une restitution client.');
        }
        if (!sb.nomClient || !sb.nomClient.trim()) {
          throw new BadRequestException('Le nom du client est requis pour une restitution client.');
        }
        await this.authz.assertDivisionInPerimeter(currentUserId, sb.divisionId);
      }
    }
    if (typeBon?.requiertNumeroClient) {
      for (const sb of input.soubons) {
        if (!sb.numeroClient || !String(sb.numeroClient).trim()) {
          throw new BadRequestException('Le numéro du client est requis pour ce type de bon.');
        }
      }
    }
    // Format du numéro client : c'est un identifiant SAP (KUNNR), donc uniquement
    // des chiffres. Contrôlé ici car la création de bon ne passe pas par un DTO
    // class-validator — sans ça, l'API et le mobile accepteraient n'importe quoi.
    for (const sb of input.soubons) {
      const num = sb.numeroClient == null ? '' : String(sb.numeroClient).trim();
      if (num !== '' && !/^\d+$/.test(num)) {
        throw new BadRequestException(
          `Numéro client invalide (« ${num} ») : il ne doit contenir que des chiffres.`,
        );
      }
    }
    await this.assertPaysCoherentAvecClient(input.soubons);
    // Type exigeant un partenaire : présence obligatoire ET le partenaire doit être
    // relié à un fournisseur SAP (n° fournisseur / LIFNR). Contrôle serveur (vaut pour
    // l'API et le mobile), pas seulement le formulaire web.
    if (typeBon?.requiertPartenaire) {
      for (const sb of input.soubons) {
        if (!sb.partenaireId) {
          throw new BadRequestException('Un partenaire est requis pour ce type de bon.');
        }
      }
      const ids = [...new Set(input.soubons.map((sb) => String(sb.partenaireId)))];
      const placeholders = ids.map((_, i) => `@${i}`).join(', ');
      const rows: Array<{ raison_sociale: string; numero_fournisseur: string | null }> =
        await this.dataSource.query(
          `SELECT raison_sociale, numero_fournisseur FROM dbo.ref_partenaire WHERE id IN (${placeholders})`,
          ids,
        );
      const sansFournisseur = rows.filter((r) => !r.numero_fournisseur || !String(r.numero_fournisseur).trim());
      if (sansFournisseur.length) {
        throw new BadRequestException(
          `Fournisseur sans N° SAP : ${sansFournisseur.map((r) => r.raison_sociale).join(', ')}. Renseignez le N° fournisseur SAP dans Partenaires.`,
        );
      }
    }
    if (typeBon?.requiertBl) {
      for (const sb of input.soubons) {
        if (!sb.numeroBl || !String(sb.numeroBl).trim()) {
          throw new BadRequestException('Le N° de document (BL) est requis pour ce type de bon.');
        }
      }
    }

    // Nature d'opération obligatoire sur chaque sous-bon (contrôle serveur, vaut aussi
    // pour l'API et le mobile ; le formulaire web l'impose déjà côté client).
    // Puis cloisonnement : l'utilisateur doit avoir la nature dans sa liste blanche
    // (sec_user_nature_operation). Le périmètre s'applique à TOUS, administrateurs et
    // super admin compris (aucun bypass) : sans nature attribuée, la création est bloquée.
    for (const sb of input.soubons) {
      if (!sb.natureOperationId) {
        throw new BadRequestException("La nature d'opération est requise pour chaque sous-bon.");
      }
      await this.authz.assertNatureInPerimeter(currentUserId, String(sb.natureOperationId));
    }

    /**
     * Récurrence : fréquence ET première échéance, ou rien.
     *
     * Un bon coché « récurrent » sans échéance ne se rappelle jamais — c'était
     * l'état de la fonctionnalité avant le 12/08/2026 : la case existait, elle
     * ne produisait rien. Le contrôle est ici, et non dans le DTO, parce qu'il
     * porte sur la COHÉRENCE de trois champs entre eux.
     */
    const echeance = this.echeanceInitiale(input);

    const montantTotal = input.soubons.reduce((sum, sb) => {
      return (parseFloat(sum) + parseFloat(sb.montant)).toString();
    }, '0');

    // Auto-validation (cf. Dossier) : un bon créé par un signataire (rôle VALIDATEUR,
    // ou admin/DAF) est validé d'emblée. Les rôles sont résolus hors transaction.
    const creatorCodes = await this.authz.getUserRoleCodes(currentUserId);
    const isSignataire = ['VALIDATEUR', 'SUPER_ADMIN', 'ADMINISTRATEUR'].some((r) => creatorCodes.has(r));
    const statutInitial: BonStatut = isSignataire ? 'VALIDE' : 'CREE';

    const bonId = await this.dataSource.transaction(async (manager) => {
      const bonRepo = manager.getRepository(Bon);
      const sousBonRepo = manager.getRepository(SousBon);

      const bon = bonRepo.create({
        numero: await this.generateNextBonNumber(bonRepo),
        uuid: uuidv4(),
        demandeurId: input.demandeurId as any,
        typeBonId: input.typeBonId as any,
        creeParInterimId: input.creeParInterimId ? (input.creeParInterimId as any) : null,
        montantTotal,
        statut: statutInitial,
        estRecurrent: input.estRecurrent ?? false,
        frequenceRecurrence: input.estRecurrent ? (input.frequenceRecurrence ?? null) : null,
        dateProchaineEcheance: echeance,
        demandeExtension: input.demandeExtension ?? false,
        descriptionExtension: input.descriptionExtension ?? null,
        statutExtension: input.demandeExtension ? 'EN_ATTENTE' : 'NON',
        porteur: input.porteur?.trim() ? input.porteur.trim() : null,
        createdById: currentUserId as any,
      });
      const savedBon = await bonRepo.save(bon);

      let numeroSousBon = 1;
      for (const sbData of input.soubons) {
        await sousBonRepo.save(
          sousBonRepo.create({
            bonId: savedBon.id as any,
            uuid: uuidv4(),
            numeroSousBon,
            // Libellé non saisi (ex. restitution) : on retombe sur le nom client.
            libelle:
              (sbData.libelle && sbData.libelle.trim()) ||
              (sbData.nomClient && sbData.nomClient.trim()) ||
              'Sous-bon',
            description: sbData.description ?? null,
            montant: sbData.montant,
            partenaireId: sbData.partenaireId ? (sbData.partenaireId as any) : null,
            numeroBl: sbData.numeroBl ?? '',
            codeManutention: sbData.codeManutention,
            costCenterId: sbData.costCenterId as any,
            natureOperationId: sbData.natureOperationId ? (sbData.natureOperationId as any) : null,
            natureComptableId: sbData.natureComptableId ? (sbData.natureComptableId as any) : null,
            caisseId: sbData.caisseId as any,
            portefeuilleId: sbData.portefeuilleId as any,
            deviseId: sbData.deviseId as any,
            numeroClient: sbData.numeroClient ?? null,
            nomClient: sbData.nomClient?.trim() ? sbData.nomClient.trim() : null,
            paysId: sbData.paysId ? (sbData.paysId as any) : null,
            divisionId: sbData.divisionId ? (sbData.divisionId as any) : null,
            statut: statutInitial,
            createdById: currentUserId as any,
          }),
        );
        numeroSousBon++;
      }

      // Trace de l'auto-validation pour l'historique/audit.
      if (isSignataire) {
        const validationRepo = manager.getRepository(ValidationBon);
        await validationRepo.save(
          validationRepo.create({
            bonId: savedBon.id as any,
            validateurId: currentUserId as any,
            niveauValidation: 1,
            action: 'VALIDE',
            commentaire: 'Auto-validation (créateur signataire)',
            dateValidation: new Date(),
          }),
        );
      }

      return savedBon.id;
    });

    const created = await this.findOne(bonId);
    // Push aux validateurs de la direction (uniquement si le bon attend une validation).
    if (statutInitial === 'CREE') {
      void this.push.notifyValidateursNewBon(currentUserId, created);
    }
    return created;
  }

  async findOne(id: string): Promise<Bon> {
    const bon = await this.bonRepo.findOne({ where: { id } });
    if (!bon) throw new NotFoundException(`Bon ${id} introuvable`);
    return bon;
  }

  /** Historique des validations d'un bon (validateur, décision, commentaire, date). */
  async getValidations(bonId: string): Promise<ValidationBon[]> {
    return this.validationBonRepo.find({
      where: { bonId: bonId as any },
      order: { dateValidation: 'DESC' },
    });
  }

  // ───────────────────────── Circuit d'extension de budget ─────────────────────────

  /** Refuse une demande d'extension (permission EXTENSION_APPROUVER). */
  async refuserExtension(bonId: string, userId: string, commentaire?: string): Promise<Bon> {
    await this.authz.assertPermission(userId, 'EXTENSION_APPROUVER', "refuser une demande d'extension");
    const bon = await this.findOne(bonId);
    if (bon.statutExtension !== 'EN_ATTENTE') {
      throw new BadRequestException(
        `Action impossible : l'extension de ce bon est « ${bon.statutExtension} ».`,
      );
    }
    bon.statutExtension = 'REFUSEE';
    bon.extensionDecideParId = userId as any;
    bon.extensionDateDecision = new Date();
    bon.extensionCommentaire = commentaire ?? null;
    bon.updatedById = userId as any;
    return this.bonRepo.save(bon);
  }

  /**
   * Approuve une demande d'extension (permission EXTENSION_APPROUVER).
   *  - mode DECOUVERT : autorise le décaissement même si le portefeuille passe en négatif.
   *  - mode RECHARGE  : recharge immédiatement le(s) portefeuille(s) du bon (déficit), depuis leur caisse source.
   */
  async approuverExtension(
    bonId: string,
    userId: string,
    mode: ExtensionMode,
    commentaire?: string,
  ): Promise<Bon> {
    await this.authz.assertPermission(userId, 'EXTENSION_APPROUVER', "approuver une demande d'extension");
    if (mode !== 'DECOUVERT' && mode !== 'RECHARGE') {
      throw new BadRequestException("Mode d'approbation invalide (DECOUVERT ou RECHARGE).");
    }
    const bon = await this.findOne(bonId);
    if (bon.statutExtension !== 'EN_ATTENTE') {
      throw new BadRequestException(
        `Action impossible : l'extension de ce bon est « ${bon.statutExtension} ».`,
      );
    }
    if (mode === 'RECHARGE') {
      await this.rechargerPortefeuillesPourBon(bonId, userId);
    }
    bon.statutExtension = 'APPROUVEE';
    bon.extensionMode = mode;
    bon.extensionDecideParId = userId as any;
    bon.extensionDateDecision = new Date();
    bon.extensionCommentaire = commentaire ?? null;
    bon.updatedById = userId as any;
    return this.bonRepo.save(bon);
  }

  /** Recharge le déficit de chaque portefeuille du bon depuis sa caisse source (mode RECHARGE). */
  private async rechargerPortefeuillesPourBon(bonId: string, userId: string): Promise<void> {
    const soubons = await this.sousBonRepo.find({ where: { bonId: bonId as any } });
    const parPortefeuille = new Map<string, number>();
    for (const sb of soubons) {
      const pid = String(sb.portefeuilleId);
      parPortefeuille.set(pid, (parPortefeuille.get(pid) ?? 0) + Number(sb.montant));
    }
    for (const [pid, besoin] of parPortefeuille) {
      const ptf = await this.dataSource.getRepository(Portefeuille).findOne({ where: { id: pid } });
      if (!ptf) throw new NotFoundException(`Portefeuille ${pid} introuvable`);
      // Solde DANS LA DEVISE du portefeuille — sinon on comparerait un besoin à
      // une somme de devises différentes.
      const solde = Number(
        await this.ledger.calculateBalance(pid, 'PORTEFEUILLE', String(ptf.deviseId)),
      );
      const deficit = besoin - solde;
      if (deficit <= 0) continue;
      const caisse = await this.dataSource
        .getRepository(Caisse)
        .findOne({ where: { id: ptf.caisseSourceId } });
      if (!caisse) throw new NotFoundException('Caisse source du portefeuille introuvable');
      if (caisse.statut !== 'OUVERTE') {
        throw new BadRequestException(
          `La caisse ${caisse.code} est fermée : recharge d'extension impossible.`,
        );
      }
      const montant = deficit.toFixed(4);
      await this.dataSource.transaction(async (manager) => {
        // Point de passage commun : la devise retenue est celle du PORTEFEUILLE
        // (l'ancienne version prenait celle de la caisse, ce qui ne créditait
        // rien quand les deux différaient), et la caisse doit détenir cette
        // devise, sinon l'extension est refusée plutôt que de creuser un négatif.
        await this.ledger.mouvementCaissePortefeuille(
          {
            caisseId: caisse.id,
            portefeuilleId: ptf.id,
            montant,
            sens: 'CAISSE_VERS_PORTEFEUILLE',
            typeOperation: 'RECHARGE',
            userId,
            reference: `Extension bon ${bonId}`,
          },
          manager,
        );
      });
    }
  }

  /**
   * Garde de solde au décaissement : refuse si le portefeuille deviendrait négatif,
   * sauf si une extension a été approuvée en mode DECOUVERT pour ce bon.
   */
  async assertSoldeSuffisantOuExtension(
    portefeuilleId: string,
    montant: string,
    bonId: string,
  ): Promise<void> {
    // Solde DANS LA DEVISE du portefeuille (cf. calculateBalance) : un solde
    // toutes devises confondues laisserait passer un décaissement non couvert.
    const ptf = await this.dataSource
      .getRepository(Portefeuille)
      .findOne({ where: { id: portefeuilleId as any } });
    const solde = Number(
      await this.ledger.calculateBalance(
        portefeuilleId,
        'PORTEFEUILLE',
        ptf ? String(ptf.deviseId) : undefined,
      ),
    );
    if (solde - Number(montant) >= 0) return;
    const bon = await this.findOne(bonId);
    if (bon.statutExtension === 'APPROUVEE' && bon.extensionMode === 'DECOUVERT') return;
    const raison =
      bon.statutExtension === 'EN_ATTENTE'
        ? "une demande d'extension est en attente d'approbation"
        : bon.statutExtension === 'REFUSEE'
          ? "la demande d'extension a été refusée"
          : bon.statutExtension === 'APPROUVEE'
            ? "l'extension a été approuvée en mode recharge ; rechargez d'abord le portefeuille"
            : "aucune demande d'extension n'a été formulée";
    throw new BadRequestException(
      `Solde du portefeuille insuffisant pour ce décaissement : ${raison}.`,
    );
  }

  /**
   * Périmètre d'autorisation d'un utilisateur pour la création de bons.
   *  - isAdmin               : SUPER_ADMIN ou ADMINISTRATEUR → aucun cloisonnement
   *  - allowedCcIds          : centres de coût autorisés (null = tous)
   *  - allowedCaisseIds      : caisses autorisées (null = toutes)
   *  - allowedPortefeuilleIds: portefeuilles autorisés (null = tous)
   *  - hasMultiCc            : peut mélanger plusieurs CC sur un même bon (perm. BON_MULTI_CC)
   *
   * Périmètres (non-admin) :
   *  - CC          = CC de sa direction ∪ CC assignés (sec_user_cost_center) ∪ CC principal
   *  - Caisses     = caisses avec accès ECRITURE/ADMIN (sec_user_caisse_access)
   *  - Portefeuilles = possédés (USER) ∪ de sa direction (DIRECTION) ∪ dont il est gestionnaire
   *
   * Pour chaque axe, un périmètre vide (données non peuplées) ⇒ null (on n'enferme pas).
   */
  private async resolveBonPerimeter(userId: string): Promise<{
    isAdmin: boolean;
    allowedCcIds: Set<string> | null;
    allowedCaisseIds: Set<string> | null;
    allowedPortefeuilleIds: Set<string> | null;
    hasMultiCc: boolean;
  }> {
    // Rôles, permission multi-CC et périmètres caisses/portefeuilles : source unique = AuthorizationService.
    if (await this.authz.isAdmin(userId)) {
      return {
        isAdmin: true,
        allowedCcIds: null,
        allowedCaisseIds: null,
        allowedPortefeuilleIds: null,
        hasMultiCc: true,
      };
    }

    try {
      const hasMultiCc = await this.authz.hasPermission(userId, 'BON_MULTI_CC');

      // --- Périmètre CC (spécifique au bon) = direction ∪ CC assignés ∪ CC principal ---
      const user = await this.dataSource.getRepository(User).findOne({ where: { id: userId } });
      const ccs = new Set<string>();
      if (user?.directionId) {
        const dirCcs = await this.dataSource
          .getRepository(CostCenter)
          .find({ where: { directionId: user.directionId as any } });
        for (const cc of dirCcs) ccs.add(String(cc.id));
      }
      const assignedCcs = await this.dataSource
        .getRepository(UserCostCenter)
        .find({ where: { userId: userId as any } });
      for (const a of assignedCcs) ccs.add(String(a.costCenterId));
      if (user?.costCenterId) ccs.add(String(user.costCenterId));

      return {
        isAdmin: false,
        allowedCcIds: ccs.size > 0 ? ccs : null,
        allowedCaisseIds: await this.authz.getCaissePerimeter(userId),
        allowedPortefeuilleIds: await this.authz.getPortefeuillePerimeter(userId),
        hasMultiCc,
      };
    } catch (e) {
      // Fail-open : si la résolution du périmètre échoue, on n'enferme pas l'utilisateur
      // (le formulaire et la création restent fonctionnels). L'erreur réelle est loguée.
      console.warn('[bons] résolution du périmètre échouée, fallback sans restriction :', (e as Error).message);
      return {
        isAdmin: false,
        allowedCcIds: null,
        allowedCaisseIds: null,
        allowedPortefeuilleIds: null,
        hasMultiCc: false,
      };
    }
  }

  /**
   * Vérifie qu'un bon respecte le périmètre de l'utilisateur (CC + caisses + portefeuilles)
   * et la règle multi-CC. Lève ForbiddenException en cas de violation.
   */
  private async enforceBonPerimeter(
    userId: string,
    soubons: Array<{ costCenterId: string; caisseId: string; portefeuilleId: string }>,
  ): Promise<void> {
    const perimeter = await this.resolveBonPerimeter(userId);
    if (perimeter.isAdmin) return;

    const ccIds = soubons.map((sb) => String(sb.costCenterId));
    const caisseIds = soubons.map((sb) => String(sb.caisseId));
    const ptfIds = soubons.map((sb) => String(sb.portefeuilleId));

    const outOf = (ids: string[], allowed: Set<string> | null): string[] =>
      allowed ? [...new Set(ids)].filter((id) => !allowed.has(id)) : [];

    const ccHors = outOf(ccIds, perimeter.allowedCcIds);
    if (ccHors.length > 0) {
      throw new ForbiddenException(`Centre(s) de coût hors de votre périmètre : ${ccHors.join(', ')}`);
    }
    const caisseHors = outOf(caisseIds, perimeter.allowedCaisseIds);
    if (caisseHors.length > 0) {
      throw new ForbiddenException(`Caisse(s) hors de votre périmètre : ${caisseHors.join(', ')}`);
    }
    const ptfHors = outOf(ptfIds, perimeter.allowedPortefeuilleIds);
    if (ptfHors.length > 0) {
      throw new ForbiddenException(`Portefeuille(s) hors de votre périmètre : ${ptfHors.join(', ')}`);
    }

    if (new Set(ccIds).size > 1 && !perimeter.hasMultiCc) {
      throw new ForbiddenException(
        'Un bon ne peut porter que sur un seul centre de coût. La permission BON_MULTI_CC est requise pour le multi-CC.',
      );
    }
  }

  /**
   * Périmètre de l'utilisateur pour alimenter le formulaire de création de bon :
   * centres de coût, caisses et portefeuilles autorisés + indicateur multi-CC.
   */
  async getBonPerimeter(userId: string): Promise<{
    costCenters: CostCenter[];
    caisses: Caisse[];
    portefeuilles: Portefeuille[];
    naturesOperation: NatureOperation[];
    hasMultiCc: boolean;
    isAdmin: boolean;
  }> {
    const perimeter = await this.resolveBonPerimeter(userId);

    const ccRepo = this.dataSource.getRepository(CostCenter);
    const caisseRepo = this.dataSource.getRepository(Caisse);
    const ptfRepo = this.dataSource.getRepository(Portefeuille);
    const natureRepo = this.dataSource.getRepository(NatureOperation);

    const costCenters = perimeter.allowedCcIds
      ? await ccRepo.find({ where: { id: In([...perimeter.allowedCcIds]) as any, estActif: true }, order: { libelle: 'ASC' } })
      : await ccRepo.find({ where: { estActif: true }, order: { libelle: 'ASC' } });

    const caisses = perimeter.allowedCaisseIds
      ? await caisseRepo.find({ where: { id: In([...perimeter.allowedCaisseIds]) as any, estActif: true }, order: { code: 'ASC' } })
      : await caisseRepo.find({ where: { estActif: true }, order: { code: 'ASC' } });

    const portefeuilles = perimeter.allowedPortefeuilleIds
      ? await ptfRepo.find({ where: { id: In([...perimeter.allowedPortefeuilleIds]) as any, estActif: true }, order: { code: 'ASC' } })
      : await ptfRepo.find({ where: { estActif: true }, order: { code: 'ASC' } });

    // Natures d'opération autorisées : admin = toutes ; non-admin = liste blanche
    // (éventuellement vide → aucune, donc le formulaire ne propose rien).
    const naturePerim = await this.authz.getNatureOperationPerimeter(userId);
    let naturesOperation: NatureOperation[];
    if (naturePerim === null) {
      naturesOperation = await natureRepo.find({ where: { estActif: true }, order: { libelle: 'ASC' } });
    } else if (naturePerim.size === 0) {
      naturesOperation = [];
    } else {
      naturesOperation = await natureRepo.find({
        where: { id: In([...naturePerim]) as any, estActif: true },
        order: { libelle: 'ASC' },
      });
    }

    return {
      costCenters,
      caisses,
      portefeuilles,
      naturesOperation,
      hasMultiCc: perimeter.hasMultiCc,
      isAdmin: perimeter.isAdmin,
    };
  }

  /**
   * Recherche serveur des bons avec filtres composables.
   * Tous les filtres sont optionnels et appliqués via QueryBuilder (donc en BD).
   */
  /**
   * Whitelist des colonnes triables côté BD.
   * Tout sortBy hors de cette liste tombe sur le défaut (created_at DESC).
   * Sécurité : empêche un client de demander un ORDER BY sur une colonne
   * sensible ou inconnue.
   */
  private static readonly BON_SORT_MAP: Record<string, string> = {
    numero: 'bon.numero',
    statut: 'bon.statut',
    montantTotal: 'bon.montant_total',
    createdAt: 'bon.created_at',
    // Trier sur le NOM du demandeur, pas sur son identifiant : la liste
    // l'affiche en clair, un tri par id n'aurait aucun sens pour qui la lit.
    // La jointure n'est posée que si ce tri est demandé (cf. plus bas).
    demandeur: 'demandeur.nom',
  };

  async findAll(opts: {
    statut?: BonStatut;
    period?: 'today' | 'week' | 'month';
    typeBonId?: string;
    demandeurId?: string;
    /**
     * Bons sur lesquels cet utilisateur a rendu une décision. Quand il est
     * fourni, `dateFrom`/`dateTo` portent sur la DATE DE DÉCISION et non sur la
     * date de création : un validateur qui cherche « ce que j'ai validé cette
     * semaine » raisonne sur le jour où il a signé, pas sur le jour où le
     * demandeur a saisi.
     */
    validateurId?: string;
    extension?: boolean;
    statutExtension?: string;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
    sortBy?: string;
    sortDir?: 'asc' | 'desc';
  } = {}): Promise<Bon[]> {
    const query = this.bonRepo.createQueryBuilder('bon').where('1=1');

    /**
     * Nom du demandeur, joint pour TOUTE la liste — sinon l'écran n'a que des
     * identifiants et doit rapatrier l'annuaire entier pour les traduire.
     *
     * La jointure passe par une SOUS-REQUÊTE, et non par la table `sec_user`
     * directement : TypeORM ajoute alors d'office `AND deleted_at IS NULL`, et
     * les 11 bons sur 28 dont le demandeur a été supprimé perdraient leur nom.
     * Un bon garde son auteur même si le compte n'existe plus.
     */
    query
      .leftJoin(
        '(SELECT id, nom, prenom, matricule FROM dbo.sec_user)',
        'demandeur',
        'demandeur.id = bon.demandeur_id',
      )
      .addSelect('demandeur.nom', 'demandeurNom')
      .addSelect('demandeur.prenom', 'demandeurPrenom')
      .addSelect('demandeur.matricule', 'demandeurMatricule');

    if (opts.statut) {
      /**
       * Plusieurs statuts séparés par des virgules sont acceptés
       * (`statut=CREE,VALIDE`).
       *
       * Une tuile de tableau de bord compte parfois un ENSEMBLE de statuts —
       * « bons en cours » = créés ou validés. Sans cette forme, son lien devait
       * se rabattre sur un seul statut, et la liste montrait moins que le
       * compteur annoncé. Constaté le 12/08/2026 : tuile à 11, liste à 1.
       */
      const statuts = String(opts.statut)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (statuts.length > 1) {
        query.andWhere('bon.statut IN (:...statuts)', { statuts });
      } else {
        query.andWhere('bon.statut = :statut', { statut: statuts[0] });
      }
    }
    if (opts.typeBonId) {
      query.andWhere('bon.type_bon_id = :typeBonId', { typeBonId: opts.typeBonId });
    }
    if (opts.demandeurId) {
      query.andWhere('bon.demandeur_id = :demandeurId', { demandeurId: opts.demandeurId });
    }
    if (opts.extension === true) {
      query.andWhere('bon.demande_extension = 1');
    }
    if (opts.statutExtension) {
      query.andWhere('bon.statut_extension = :statutExtension', {
        statutExtension: opts.statutExtension,
      });
    }
    if (opts.search) {
      /**
       * Numéro OU montant : sur mobile, on cherche aussi bien « BON-0028 » que
       * « 50000 ». Le montant est comparé en texte — c'est une recherche, pas un
       * calcul, et `LIKE` sur un DECIMAL converti trouve « 5000 » dans
       * « 5000.0000 ».
       */
      query.andWhere(
        '(bon.numero LIKE :q OR CAST(bon.montant_total AS nvarchar(40)) LIKE :q)',
        { q: `%${opts.search}%` },
      );
    }

    // Période prédéfinie
    if (opts.period) {
      const now = new Date();
      const cutoff = new Date();
      cutoff.setUTCHours(0, 0, 0, 0);
      if (opts.period === 'today') {
        // déjà à minuit UTC du jour courant
      } else if (opts.period === 'week') {
        cutoff.setUTCDate(cutoff.getUTCDate() - 6);
      } else if (opts.period === 'month') {
        cutoff.setUTCDate(1);
      }
      query.andWhere('bon.created_at >= :cutoff', { cutoff });
      query.andWhere('bon.created_at <= :now', { now });
    }

    // Bornes de la plage : minuit et fin de journée, calculées une seule fois.
    const debut = opts.dateFrom ? new Date(opts.dateFrom) : null;
    const fin = opts.dateTo ? new Date(opts.dateTo) : null;
    if (fin) fin.setHours(23, 59, 59, 999);

    /**
     * « Les bons que j'ai traités » — un EXISTS sur le journal des décisions.
     *
     * EXISTS et non jointure : un bon peut porter PLUSIEURS décisions du même
     * validateur (validation puis signature), et une jointure le ferait
     * apparaître autant de fois dans la liste.
     *
     * Toutes les décisions comptent, y compris les REFUS : un validateur qui
     * cherche ce qu'il a traité doit retrouver ce qu'il a refusé, sinon le bon
     * semble avoir disparu. Le statut affiché en dit l'issue.
     */
    if (opts.validateurId) {
      let exists =
        'EXISTS (SELECT 1 FROM dbo.trx_validation_bon v ' +
        'WHERE v.bon_id = bon.id AND v.validateur_id = :validateurId';
      if (debut) exists += ' AND v.date_validation >= :vdf';
      if (fin) exists += ' AND v.date_validation <= :vdt';
      query.andWhere(`${exists})`, {
        validateurId: opts.validateurId,
        ...(debut ? { vdf: debut } : {}),
        ...(fin ? { vdt: fin } : {}),
      });
    } else {
      // Plage personnalisée (prend le dessus sur period si les deux sont fournis)
      if (debut) query.andWhere('bon.created_at >= :df', { df: debut });
      if (fin) query.andWhere('bon.created_at <= :dt', { dt: fin });
    }

    // Montant RÉELLEMENT décaissé (somme des décaissements effectifs, ajustements
    // caissier inclus) — exposé en plus du montant demandé (bon.montant_total) pour
    // que les listes affichent le bon montant sans requête N+1.
    query.addSelect(
      '(SELECT COALESCE(SUM(d.montant), 0) FROM trx_decaissement d ' +
        'INNER JOIN trx_bon_caisse bc ON bc.id = d.bon_caisse_id ' +
        'WHERE bc.bon_source_id = bon.id)',
      'montantDecaisse',
    );

    // Tri (whitelist + direction normalisée). Par défaut : created_at DESC.
    const column = BonsService.BON_SORT_MAP[opts.sortBy ?? ''];
    const direction: 'ASC' | 'DESC' = opts.sortDir === 'asc' ? 'ASC' : 'DESC';
    if (column) {
      // La jointure du demandeur est déjà posée plus haut : le tri porte donc
      // sur son NOM, pas sur son identifiant, et vaut aussi pour les comptes
      // supprimés.
      if (opts.sortBy === 'demandeur') {
        query.orderBy('demandeur.nom', direction).addOrderBy('demandeur.prenom', direction);
      } else {
        query.orderBy(column, direction);
      }
    } else {
      query.orderBy('bon.created_at', 'DESC');
    }

    const { entities, raw } = await query.getRawAndEntities();

    /**
     * On apparie raw et entities PAR IDENTIFIANT, jamais par position.
     *
     * TypeORM ne garantit pas que `entities` conserve l'ordre de `raw` : dès
     * que le tri porte sur une colonne jointe non sélectionnée, il le perd.
     * L'appariement positionnel qui se trouvait ici attachait alors le montant
     * décaissé au MAUVAIS bon — un montant juste, en face du mauvais numéro.
     *
     * `raw` conserve, lui, l'ordre du SQL : on le prend comme référence pour
     * l'ordre final. Le tri reste donc entièrement fait par la base.
     */
    const parId = new Map<string, Bon>(entities.map((b) => [String(b.id), b]));
    const vus = new Set<string>();
    const ordonnes: Bon[] = [];

    for (const ligne of raw as Array<Record<string, unknown>>) {
      const id = String(ligne.bon_id ?? '');
      const bon = parId.get(id);
      if (!bon || vus.has(id)) continue;
      vus.add(id);
      const md = ligne.montantDecaisse;
      // null si rien décaissé ; sinon le total effectif (string DECIMAL).
      const enrichi = bon as Bon & {
        montantDecaisse?: string | null;
        demandeurNom?: string | null;
        demandeurMatricule?: string | null;
      };
      enrichi.montantDecaisse = md != null && Number(md) > 0 ? String(md) : null;

      const prenom = (ligne.demandeurPrenom as string) ?? '';
      const nom = (ligne.demandeurNom as string) ?? '';
      const complet = `${prenom} ${nom}`.trim();
      enrichi.demandeurNom = complet || null;
      enrichi.demandeurMatricule = (ligne.demandeurMatricule as string) ?? null;
      ordonnes.push(bon);
    }

    // Filet : un bon que `raw` n'aurait pas nommé ne doit pas disparaître.
    for (const bon of entities) {
      if (!vus.has(String(bon.id))) ordonnes.push(bon);
    }
    return ordonnes;
  }

  /**
   * Combien de bons par statut, sur la même plage que la liste.
   *
   * Sert aux puces de filtre du mobile : n'afficher que les statuts qui
   * existent vraiment. Sans cette réponse, l'écran proposait les sept statuts
   * en permanence, dont plusieurs ne menaient qu'à une liste vide — et les
   * déduire de la page déjà reçue reviendrait à filtrer en mémoire, donc à
   * ignorer tout ce que le serveur n'a pas encore envoyé.
   *
   * Le statut n'est délibérément PAS un filtre ici : les compteurs doivent
   * rester complets même quand une puce est sélectionnée, sinon la sélection
   * ferait disparaître toutes les autres.
   */
  async compterParStatut(opts: {
    demandeurId?: string;
    dateFrom?: string;
    dateTo?: string;
  }): Promise<Array<{ statut: string; count: number; montant: number }>> {
    const qb = this.bonRepo
      .createQueryBuilder('bon')
      .select('bon.statut', 'statut')
      .addSelect('COUNT(bon.id)', 'count')
      .addSelect('SUM(CAST(bon.montant_total AS DECIMAL(19,4)))', 'montant')
      .where('1=1')
      .groupBy('bon.statut');

    if (opts.demandeurId) {
      qb.andWhere('bon.demandeur_id = :demandeurId', { demandeurId: opts.demandeurId });
    }
    if (opts.dateFrom) {
      qb.andWhere('bon.created_at >= :df', { df: new Date(opts.dateFrom) });
    }
    if (opts.dateTo) {
      const fin = new Date(opts.dateTo);
      fin.setHours(23, 59, 59, 999);
      qb.andWhere('bon.created_at <= :dt', { dt: fin });
    }

    const rows: Array<{ statut: string; count: string | number; montant: string | null }> =
      await qb.getRawMany();
    return rows.map((r) => ({
      statut: r.statut,
      count: Number(r.count) || 0,
      montant: Number(r.montant ?? 0) || 0,
    }));
  }

  /**
   * Série temporelle des bons par jour sur les `days` derniers jours.
   * Utilisé pour les sparklines des dashboards.
   * Filtres optionnels : statut, demandeur.
   */
  async getTimeline(opts: {
    days?: number;
    statut?: BonStatut;
    demandeurId?: string;
  }): Promise<Array<{ date: string; count: number; montant: number }>> {
    const days = Math.max(1, Math.min(90, opts.days ?? 7));
    const cutoff = new Date();
    cutoff.setUTCHours(0, 0, 0, 0);
    cutoff.setUTCDate(cutoff.getUTCDate() - (days - 1));

    const qb = this.bonRepo
      .createQueryBuilder('bon')
      .select('CAST(bon.created_at AS DATE)', 'date')
      .addSelect('COUNT(bon.id)', 'count')
      .addSelect('SUM(CAST(bon.montant_total AS DECIMAL(19,4)))', 'montant')
      .where('bon.created_at >= :cutoff', { cutoff })
      .andWhere('bon.deleted_at IS NULL')
      .groupBy('CAST(bon.created_at AS DATE)');

    if (opts.statut) qb.andWhere('bon.statut = :statut', { statut: opts.statut });
    if (opts.demandeurId) qb.andWhere('bon.demandeur_id = :demandeurId', { demandeurId: opts.demandeurId });

    const rows: Array<{ date: Date | string; count: string | number; montant: string | null }> =
      await qb.getRawMany();

    // Indexer par date pour remplir les jours manquants avec 0
    const map = new Map<string, { count: number; montant: number }>();
    for (const r of rows) {
      const d =
        r.date instanceof Date
          ? r.date.toISOString().slice(0, 10)
          : String(r.date).slice(0, 10);
      map.set(d, {
        count: Number(r.count),
        montant: Number(r.montant ?? 0),
      });
    }

    const series: Array<{ date: string; count: number; montant: number }> = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(cutoff);
      d.setUTCDate(d.getUTCDate() + i);
      const key = d.toISOString().slice(0, 10);
      const v = map.get(key) ?? { count: 0, montant: 0 };
      series.push({ date: key, count: v.count, montant: v.montant });
    }
    return series;
  }

  /**
   * Décaissements agrégés par direction.
   *
   * La direction du décaissement est dérivée du *cost-center* du sous-bon
   * (pas du `directionId` du demandeur). En effet un demandeur du service
   * Achats peut créer un bon qui débite le budget de la direction Marketing :
   * c'est la direction du cost-center qui détermine l'imputation budgétaire.
   *
   * Filtre période optionnel : 'today' / 'week' / 'month' (par défaut pas de filtre).
   * Statut considéré : DECAISSE + COMPTABILISE.
   */
  async getByDirection(opts: {
    period?: 'today' | 'week' | 'month' | 'quarter' | 'all';
  } = {}): Promise<
    Array<{
      directionId: string | null;
      directionCode: string | null;
      directionLibelle: string;
      nbSousBons: number;
      nbBons: number;
      montant: number;
    }>
  > {
    // Montant RÉELLEMENT décaissé par sous-bon (ajustements caissier inclus). SQL Server
    // interdit un sous-SELECT dans un SUM() : on pré-agrège les décaissements par sous-bon
    // dans une sous-requête JOINTE, puis on somme la colonne (repli sur le montant demandé
    // si aucun décaissement). Évite l'écart demandé/décaissé (remarque de test #10).
    const decJoin =
      '(SELECT bc.sous_bon_source_id AS sb_id, SUM(dd.montant) AS montant_dec, MAX(dd.date_decaissement) AS date_dec ' +
      'FROM trx_decaissement dd INNER JOIN trx_bon_caisse bc ON bc.id = dd.bon_caisse_id ' +
      'GROUP BY bc.sous_bon_source_id)';
    const montantEffectif = 'COALESCE(dec.montant_dec, CAST(sb.montant AS DECIMAL(19,4)))';

    const qb = this.sousBonRepo
      .createQueryBuilder('sb')
      .leftJoin('ref_cost_center', 'cc', 'cc.id = sb.cost_center_id')
      .leftJoin('sec_direction', 'd', 'd.id = cc.direction_id')
      .leftJoin(decJoin, 'dec', 'dec.sb_id = sb.id')
      .where('sb.deleted_at IS NULL')
      .andWhere('sb.statut IN (:...statuts)', { statuts: ['DECAISSE', 'COMPTABILISE'] })
      .select('d.id', 'directionId')
      .addSelect('d.code', 'directionCode')
      .addSelect('d.libelle', 'directionLibelle')
      .addSelect('COUNT(sb.id)', 'nbSousBons')
      .addSelect('COUNT(DISTINCT sb.bon_id)', 'nbBons')
      .addSelect(`SUM(${montantEffectif})`, 'montant')
      .groupBy('d.id')
      .addGroupBy('d.code')
      .addGroupBy('d.libelle');

    // Filtre de période basé sur la DATE DE DÉCAISSEMENT (quand l'argent sort),
    // pas la date de création du sous-bon. 'all' (ou absent) = pas de filtre.
    if (opts.period && opts.period !== 'all') {
      const cutoff = new Date();
      cutoff.setUTCHours(0, 0, 0, 0);
      if (opts.period === 'week') cutoff.setUTCDate(cutoff.getUTCDate() - 6);
      else if (opts.period === 'month') cutoff.setUTCDate(1);
      else if (opts.period === 'quarter') cutoff.setUTCMonth(cutoff.getUTCMonth() - 3);
      qb.andWhere('dec.date_dec >= :cutoff', { cutoff });
    }

    qb.orderBy(`SUM(${montantEffectif})`, 'DESC');

    const rows: Array<{
      directionId: string | null;
      directionCode: string | null;
      directionLibelle: string | null;
      nbSousBons: string | number;
      nbBons: string | number;
      montant: string | null;
    }> = await qb.getRawMany();

    return rows.map((r) => ({
      directionId: r.directionId,
      directionCode: r.directionCode,
      directionLibelle: r.directionLibelle ?? 'Non imputé',
      nbSousBons: Number(r.nbSousBons),
      nbBons: Number(r.nbBons),
      montant: Number(r.montant ?? 0),
    }));
  }

  /**
   * Vue synthétique pour les dashboards : compteurs par statut, âge des bons en attente,
   * top demandeurs, délai moyen de validation.
   */
  async getSummary(opts: {
    demandeurId?: string;
    validateurId?: string;
  }): Promise<{
    total: number;
    byStatut: Record<string, { count: number; montant: number }>;
    pendingAgeing: { lt24h: number; lt48h: number; gt48h: number };
    avgValidationHours: number | null;
    topDemandeurs: Array<{ demandeurId: string; count: number; montant: number }>;
    extensionEnAttente: number;
  }> {
    const where: { demandeurId?: string } = {};
    if (opts.demandeurId) where.demandeurId = opts.demandeurId;

    const all = await this.bonRepo.find({ where });

    const byStatut: Record<string, { count: number; montant: number }> = {};
    let extensionEnAttente = 0;
    const now = Date.now();
    const ageing = { lt24h: 0, lt48h: 0, gt48h: 0 };

    for (const b of all) {
      const s = b.statut as string;
      byStatut[s] = byStatut[s] ?? { count: 0, montant: 0 };
      byStatut[s].count += 1;
      byStatut[s].montant += Number(b.montantTotal || 0);

      if (b.statut === 'CREE') {
        const ageMs = now - new Date(b.createdAt as any).getTime();
        const ageH = ageMs / (1000 * 60 * 60);
        if (ageH < 24) ageing.lt24h++;
        else if (ageH < 48) ageing.lt48h++;
        else ageing.gt48h++;
        if (b.demandeExtension) extensionEnAttente++;
      }
    }

    // Top demandeurs (top 5)
    const demandeurMap = new Map<string, { count: number; montant: number }>();
    for (const b of all) {
      const k = String(b.demandeurId);
      const cur = demandeurMap.get(k) ?? { count: 0, montant: 0 };
      cur.count += 1;
      cur.montant += Number(b.montantTotal || 0);
      demandeurMap.set(k, cur);
    }
    const topDemandeurs = Array.from(demandeurMap.entries())
      .map(([demandeurId, v]) => ({ demandeurId, ...v }))
      .sort((a, b) => b.montant - a.montant)
      .slice(0, 5);

    // Délai moyen de validation (sur les bons traités VALIDE/REFUSE)
    let avgValidationHours: number | null = null;
    if (opts.validateurId) {
      const validations = await this.validationBonRepo
        .createQueryBuilder('v')
        .innerJoin('trx_bon', 'b', 'b.id = v.bon_id')
        .where('v.validateur_id = :vid', { vid: opts.validateurId })
        .select('b.created_at', 'createdAt')
        .addSelect('v.date_validation', 'dateValidation')
        .getRawMany();
      const deltas = validations
        .map((r) => {
          const c = new Date(r.createdAt).getTime();
          const d = new Date(r.dateValidation).getTime();
          return (d - c) / (1000 * 60 * 60);
        })
        .filter((n) => Number.isFinite(n) && n >= 0);
      if (deltas.length > 0) {
        avgValidationHours = deltas.reduce((a, b) => a + b, 0) / deltas.length;
      }
    }

    return {
      total: all.length,
      byStatut,
      pendingAgeing: ageing,
      avgValidationHours,
      topDemandeurs,
      extensionEnAttente,
    };
  }

  /** Renvoie la dernière impression d'un bon (null si pas encore imprimé). */
  async getLatestImpression(bonId: string): Promise<ImpressionBon | null> {
    await this.findOne(bonId);
    const [latest] = await this.impressionBonRepo.find({
      where: { bonId: bonId as any },
      order: { dateImpression: 'DESC' },
      take: 1,
    });
    return latest ?? null;
  }

  async getSousBoinsOfBon(bonId: string): Promise<SousBon[]> {
    await this.findOne(bonId);
    const lignes = await this.sousBonRepo.find({
      where: { bonId: bonId as any },
      order: { numeroSousBon: 'ASC' },
    });

    /**
     * Nom du portefeuille et de la caisse qui financent chaque ligne.
     *
     * C'est l'information la plus concrète du sous-bon : elle dit D'OÙ SORT
     * L'ARGENT. Depuis qu'un bon peut porter plusieurs lignes tirant sur des
     * portefeuilles différents, ne montrer que l'identifiant revient à ne rien
     * montrer.
     *
     * Résolu ICI et non sur le téléphone : un validateur qui examine le bon
     * d'un collègue n'a pas forcément ce portefeuille dans son périmètre, son
     * annuaire local ne le connaîtrait donc pas.
     */
    if (lignes.length === 0) return lignes;

    const idsPf = [...new Set(lignes.map((l) => String(l.portefeuilleId)).filter((v) => /^\d+$/.test(v)))];
    const idsCaisse = [...new Set(lignes.map((l) => String(l.caisseId)).filter((v) => /^\d+$/.test(v)))];

    const nommer = async (table: string) => {
      const ids = table === 'fin_portefeuille' ? idsPf : idsCaisse;
      const noms = new Map<string, string>();
      if (ids.length === 0) return noms;
      try {
        const rows: Array<{ id: string | number; code: string; libelle: string }> =
          await this.sousBonRepo.manager.query(
            `SELECT id, code, libelle FROM dbo.${table} WHERE id IN (${ids.map(Number).join(',')})`,
          );
        for (const r of rows) noms.set(String(r.id), `${r.code} — ${r.libelle}`.trim());
      } catch {
        // Un libellé manquant ne doit pas priver l'écran de ses lignes.
      }
      return noms;
    };

    const [pf, caisses] = await Promise.all([nommer('fin_portefeuille'), nommer('fin_caisse')]);
    for (const l of lignes) {
      l.portefeuilleLibelle = pf.get(String(l.portefeuilleId)) ?? null;
      l.caisseLibelle = caisses.get(String(l.caisseId)) ?? null;
    }
    return lignes;
  }

  /**
   * Autorisation de modification d'un bon/sous-bon :
   * rôle VALIDATEUR **ou** permission BON_MODIFIER_SPEC (les admins / DAF passent toujours).
   */
  /**
   * Valide et normalise l'échéance d'un bon récurrent.
   *
   * Rend `null` pour un bon ordinaire — y compris s'il porte une date, qui
   * n'aurait alors aucun sens. La date doit être STRICTEMENT future : un rappel
   * fixé à aujourd'hui partirait dans l'heure qui suit la création, ce que
   * personne n'attend d'un « bon récurrent ».
   */
  private echeanceInitiale(input: {
    estRecurrent?: boolean;
    frequenceRecurrence?: string;
    dateProchaineEcheance?: string;
  }): string | null {
    if (!input.estRecurrent) return null;

    if (!input.frequenceRecurrence) {
      throw new BadRequestException('Un bon récurrent doit indiquer sa fréquence.');
    }
    const brut = (input.dateProchaineEcheance ?? '').trim();
    if (!brut) {
      throw new BadRequestException(
        'Un bon récurrent doit indiquer la date du prochain rappel.',
      );
    }
    if (!estDateIso(brut)) {
      throw new BadRequestException(
        `Date de rappel invalide (« ${brut} ») : format attendu AAAA-MM-JJ.`,
      );
    }

    const aujourdHui = new Date();
    const jourCourant = Date.UTC(
      aujourdHui.getUTCFullYear(),
      aujourdHui.getUTCMonth(),
      aujourdHui.getUTCDate(),
    );
    if (new Date(`${brut}T00:00:00.000Z`).getTime() <= jourCourant) {
      throw new BadRequestException(
        'La date de rappel doit être postérieure à aujourd’hui.',
      );
    }
    return brut;
  }

  private async assertPeutModifierBon(userId: string): Promise<void> {
    const codes = await this.authz.getUserRoleCodes(userId);
    if (this.authz.isAdminCodes(codes) || codes.has('VALIDATEUR')) return;
    if (await this.authz.hasPermission(userId, 'BON_MODIFIER_SPEC')) return;
    throw new ForbiddenException(
      'Action non autorisée (modifier un bon). Permission BON_MODIFIER ou BON_MODIFIER_SPEC requise.',
    );
  }

  /**
   * Modifie l'enveloppe d'un bon (statut CREE uniquement).
   * Réservé aux validateurs / titulaires de BON_MODIFIER_SPEC (admins inclus).
   */
  async updateBon(bonId: string, userId: string, dto: UpdateBonDto): Promise<Bon> {
    await this.assertPeutModifierBon(userId);
    const bon = await this.findOne(bonId);
    if (bon.statut !== 'CREE') {
      throw new BadRequestException(
        `Seul un bon au statut CREE peut être modifié (statut actuel : ${bon.statut}).`,
      );
    }

    if (dto.porteur !== undefined) {
      bon.porteur = dto.porteur.trim() ? dto.porteur.trim() : null;
    }
    bon.updatedById = userId as any;
    return this.bonRepo.save(bon);
  }

  /**
   * Modifie un sous-bon (cœur métier), bon et sous-bon au statut CREE uniquement.
   * Recalcule le snapshot `bon.montantTotal` si le montant change.
   * Les axes d'imputation (caisse/portefeuille/cost-center/nature/devise) sont immuables.
   */
  async updateSousBon(
    bonId: string,
    sousBonId: string,
    userId: string,
    dto: UpdateSousBonDto,
  ): Promise<SousBon> {
    await this.assertPeutModifierBon(userId);

    const bon = await this.findOne(bonId);
    if (bon.statut !== 'CREE') {
      throw new BadRequestException(
        `Seul un bon au statut CREE peut être modifié (statut actuel : ${bon.statut}).`,
      );
    }

    const sb = await this.sousBonRepo.findOne({
      where: { id: sousBonId as any, bonId: bonId as any },
    });
    if (!sb) throw new NotFoundException(`Sous-bon ${sousBonId} introuvable pour le bon ${bonId}`);
    if (sb.statut !== 'CREE') {
      throw new BadRequestException(
        `Seul un sous-bon au statut CREE peut être modifié (statut actuel : ${sb.statut}).`,
      );
    }

    if (dto.montant !== undefined && !(parseFloat(dto.montant) > 0)) {
      throw new BadRequestException('Le montant du sous-bon doit être strictement positif.');
    }

    if (dto.libelle !== undefined) sb.libelle = dto.libelle;
    if (dto.montant !== undefined) sb.montant = dto.montant;
    if (dto.description !== undefined) sb.description = dto.description.trim() ? dto.description : null;
    if (dto.partenaireId !== undefined) sb.partenaireId = dto.partenaireId ? (dto.partenaireId as any) : null;
    if (dto.numeroBl !== undefined) sb.numeroBl = dto.numeroBl;
    if (dto.codeManutention !== undefined) sb.codeManutention = dto.codeManutention;
    if (dto.numeroClient !== undefined) sb.numeroClient = dto.numeroClient ? dto.numeroClient : null;
    sb.updatedById = userId as any;

    const montantChange = dto.montant !== undefined;

    return this.dataSource.transaction(async (manager) => {
      const sousBonRepo = manager.getRepository(SousBon);
      const bonRepo = manager.getRepository(Bon);

      const saved = await sousBonRepo.save(sb);

      // Le montant d'un sous-bon a changé → re-synchroniser le snapshot du bon.
      if (montantChange) {
        const tous = await sousBonRepo.find({ where: { bonId: bonId as any } });
        const total = tous
          .reduce((sum, x) => sum + parseFloat(x.montant), 0)
          .toString();
        await bonRepo.update({ id: bonId as any }, {
          montantTotal: total,
          updatedById: userId as any,
        });
      }

      return saved;
    });
  }

  /**
   * Valide un bon - signifie l'approuver ou le refuser
   * Règle : un bon ne peut être validé que s'il est en statut CREE
   */
  async validateBon(
    bonId: string,
    validateurId: string,
    approuve: boolean,
    commentaire?: string,
    porteur?: string,
  ): Promise<ValidationBon> {
    const bon = await this.findOne(bonId);

    if (bon.statut !== 'CREE') {
      throw new BadRequestException(`Bon ${bonId} a un statut ${bon.statut} (attendu: CREE)`);
    }

    // --- Contrôle d'autorisation de la validation ---
    // 1) Permission requise : BON_VALIDER (les admins / DAF passent).
    await this.authz.assertPermission(validateurId, 'BON_VALIDER', 'valider un bon');

    const isAdmin = await this.authz.isAdmin(validateurId);

    // 2) On ne valide pas son propre bon (sauf admin).
    if (!isAdmin && String(bon.demandeurId) === String(validateurId)) {
      throw new ForbiddenException('Vous ne pouvez pas valider votre propre bon.');
    }

    // 3) Même direction que le demandeur (cf. Dossier : « signataires de la même
    //    direction »). Filet de sécurité : ignoré si une direction est inconnue.
    if (!isAdmin) {
      const userRepo = this.dataSource.getRepository(User);
      const [demandeur, valideur] = await Promise.all([
        userRepo.findOne({ where: { id: bon.demandeurId as any } }),
        userRepo.findOne({ where: { id: validateurId as any } }),
      ]);
      if (
        demandeur?.directionId &&
        valideur?.directionId &&
        String(demandeur.directionId) !== String(valideur.directionId)
      ) {
        throw new ForbiddenException('Vous ne pouvez valider que les bons de votre direction.');
      }
    }

    const validation = this.validationBonRepo.create({
      bonId: bonId as any,
      validateurId: validateurId as any,
      niveauValidation: 1,
      action: approuve ? 'VALIDE' : 'REFUSE',
      commentaire: commentaire ?? null,
      dateValidation: new Date(),
    });

    const savedValidation = await this.validationBonRepo.save(validation);

    // Le validateur peut (re)préciser la personne qui se présentera à la caisse.
    // `undefined` => on ne touche pas ; chaîne vide => on efface.
    if (porteur !== undefined) {
      bon.porteur = porteur.trim() ? porteur.trim() : null;
    }

    const nouveauStatut: BonStatut = approuve ? 'VALIDE' : 'REFUSE';
    bon.statut = nouveauStatut;
    await this.bonRepo.save(bon);

    // Propagation du statut aux sous-bons encore en CREE.
    // Le statut des sous-bons est *indépendant* après ce point (un caissier peut
    // décaisser un sous-bon pendant qu'un autre reste à traiter) mais à la
    // validation initiale ils doivent tous recevoir le même statut que le bon.
    await this.sousBonRepo
      .createQueryBuilder()
      .update(SousBon)
      .set({ statut: nouveauStatut })
      .where('bon_id = :bonId AND statut = :statutInitial', {
        bonId,
        statutInitial: 'CREE',
      })
      .execute();

    return savedValidation;
  }

  /**
   * Imprime un bon et ses sous-bons
   * Règle : un bon doit être VALIDE pour être imprimé
   */
  async printBon(bonId: string, userId: string): Promise<ImpressionBon> {
    const bon = await this.findOne(bonId);

    if (bon.statut !== 'VALIDE') {
      throw new BadRequestException(`Bon doit être VALIDE pour être imprimé (statut actuel: ${bon.statut})`);
    }

    const impression = this.impressionBonRepo.create({
      bonId: bonId as any,
      imprimeParId: userId as any,
      dateImpression: new Date(),
      aSigne: false,
    });

    return this.impressionBonRepo.save(impression);
  }

  /**
   * Signe un bon (signataire / validateur).
   * Règle : imprimé ET non signé → peut être signé.
   * Optionnel : image PNG de la signature manuscrite (data URL base64), stockée
   * dans trx_impression_bon.signature_image pour réimpression et audit.
   */
  async signBon(bonId: string, _userId: string, signatureImage?: string | null): Promise<ImpressionBon> {
    const impression = await this.impressionBonRepo.findOne({
      where: { bonId: bonId as any },
      order: { dateImpression: 'DESC' },
    });

    if (!impression) {
      throw new NotFoundException(`Le bon ${bonId} n'a pas été imprimé`);
    }

    if (impression.aSigne) {
      throw new BadRequestException(`Le bon ${bonId} est déjà signé`);
    }

    impression.aSigne = true;
    impression.dateSignature = new Date();
    if (signatureImage) impression.signatureImage = signatureImage;
    return this.impressionBonRepo.save(impression);
  }

  /**
   * Décaisse un bon (caissier uniquement) - LEGACY.
   * Conservé pour rétro-compatibilité : décaisse en bloc tous les sous-bons
   * VALIDE du bon en utilisant le même bénéficiaire.
   *
   * Pour le nouveau workflow (preparation/edition/finalisation au niveau sous-bon),
   * passer par BonsCaisseService (prepare -> update -> finalize).
   *
   * Règle : bon doit être VALIDE (l'impression/signature n'est plus exigée).
   * Seuls les sous-bons encore VALIDE sont décaissés (les autres sont ignorés).
   */
  async decaisserBon(
    bonId: string,
    caissierId: string,
    beneficiaire: string,
    beneficiairePiece?: string,
    modifications?: any,
  ): Promise<BonCaisse[]> {
    return this.dataSource.transaction(async (manager) => {
      const bonRepo = manager.getRepository(Bon);
      const sousBonRepo = manager.getRepository(SousBon);
      const impressionBonRepo = manager.getRepository(ImpressionBon);
      const bonCaisseRepo = manager.getRepository(BonCaisse);
      const decaissementRepo = manager.getRepository(Decaissement);
      const operationRepo = manager.getRepository(Operation);

      const bon = await bonRepo.findOne({ where: { id: bonId } });
      if (!bon) throw new NotFoundException(`Bon ${bonId} introuvable`);

      if (bon.statut !== 'VALIDE') {
        throw new BadRequestException(`Bon doit être VALIDE (actuel: ${bon.statut})`);
      }

      // NB : l'impression + signature du bon n'est plus exigée avant le décaissement
      // (règle assouplie à la demande métier).

      const soubons = await sousBonRepo.find({
        where: { bonId: bonId as any },
        order: { numeroSousBon: 'ASC' },
      });
      if (soubons.length === 0) {
        throw new BadRequestException('Aucun sous-bon associé au bon, décaissement impossible');
      }

      const now = new Date();
      const created: BonCaisse[] = [];

      for (const sb of soubons) {
        if (sb.statut !== 'VALIDE') continue;

        // Garde de solde (cf. circuit d'extension) : refuse si le portefeuille passe en négatif,
        // sauf extension approuvée en mode DECOUVERT pour ce bon.
        await this.assertSoldeSuffisantOuExtension(
          String(sb.portefeuilleId),
          String(sb.montant),
          String(bonId),
        );

        const bonCaisse = await bonCaisseRepo.save(
          bonCaisseRepo.create({
            uuid: uuidv4(),
            bonSourceId: bonId as any,
            sousBonSourceId: sb.id as any,
            caissierId: caissierId as any,
            dateDuplication: now,
            dateDecaissement: now,
            contenuModifie: modifications ? JSON.stringify(modifications) : null,
            beneficiaire,
            beneficiairePiece: beneficiairePiece ?? null,
            statut: 'FINALISE',
            createdById: caissierId as any,
          }),
        );

        await decaissementRepo.save(
          decaissementRepo.create({
            bonCaisseId: bonCaisse.id as any,
            caissierId: caissierId as any,
            beneficiaireNom: beneficiaire,
            beneficiairePiece: beneficiairePiece ?? null,
            montant: sb.montant,
            dateDecaissement: now,
            portefeuilleId: sb.portefeuilleId as any,
          }),
        );

        const txUuid = uuidv4();
        await operationRepo.save(
          operationRepo.create({
            transactionUuid: txUuid,
            typeOperation: 'DECAISSEMENT',
            caisseId: sb.caisseId as any,
            portefeuilleId: sb.portefeuilleId as any,
            montant: sb.montant,
            deviseId: sb.deviseId as any,
            dateOperation: now,
            userId: caissierId as any,
            reference: `BC-${bonCaisse.id}`,
          }),
        );

        // Garde budgétaire : refuse si le budget mensuel du centre de coût serait dépassé
        // (le cumul inclut les sous-bons déjà décaissés plus haut dans cette transaction).
        await this.ledger.assertCostCenterMonthlyBudget(
          sb.costCenterId ? String(sb.costCenterId) : null,
          String(sb.montant),
          manager,
        );

        // Partie double (cf. Dossier) : DÉBIT portefeuille / CRÉDIT charge (centre de coût).
        await this.ledger.createPairedEcritures(
          { compteId: sb.portefeuilleId, typeCompte: 'PORTEFEUILLE', deviseId: sb.deviseId, costCenterId: sb.costCenterId },
          {
            compteId: sb.costCenterId,
            typeCompte: 'CHARGE',
            deviseId: sb.deviseId,
            costCenterId: sb.costCenterId,
            // Lien sous-bon → nature comptable → compte PCGG (envoi SAP).
            referenceSousBonId: String(sb.id),
            referenceBonId: String(sb.bonId),
          },
          sb.montant,
          txUuid,
          manager,
        );

        sb.statut = 'DECAISSE';
        sb.dateDecaissement = now;
        await sousBonRepo.save(sb);

        created.push(bonCaisse);
      }

      // Si tous les sous-bons sont DECAISSE on passe le bon entier en DECAISSE
      const tous = await sousBonRepo.find({ where: { bonId: bonId as any } });
      if (tous.length > 0 && tous.every((s) => s.statut === 'DECAISSE')) {
        bon.statut = 'DECAISSE';
        await bonRepo.save(bon);
      }

      return created;
    });
  }

  /**
   * Génère le hash d'intégrité SHA-256 pour les écritures comptables
   */
  private hashEcriture(data: any, hashPrecedent?: string): string {
    const json = JSON.stringify({
      ...data,
      hash_precedent: hashPrecedent || '',
    });
    return crypto.createHash('sha256').update(json).digest('hex');
  }

  /**
   * Génère le prochain numéro de bon
   */
  private async generateNextBonNumber(repo: Repository<Bon>): Promise<string> {
    const [lastBon] = await repo.find({ order: { numero: 'DESC' }, take: 1 });

    if (!lastBon) return 'BON-0001';

    const match = lastBon.numero.match(/BON-(\d+)/);
    const nextNum = match ? parseInt(match[1], 10) + 1 : 1;
    return `BON-${String(nextNum).padStart(4, '0')}`;
  }

  /**
   * Annule un bon
   */
  async cancelBon(bonId: string, userId: string): Promise<Bon> {
    const bon = await this.findOne(bonId);

    if (['DECAISSE', 'COMPTABILISE', 'ANNULE'].includes(bon.statut)) {
      throw new BadRequestException(`Impossible d'annuler un bon au statut ${bon.statut}`);
    }

    const isOwn = String(bon.demandeurId) === String(userId);

    // Autorisations (les admins passent), toutes basées sur des PERMISSIONS
    // (assignables via un rôle ou un profil dans le back-office) :
    //  - Bon DÉJÀ VALIDÉ  → permission BON_ANNULER_VALIDE. Un demandeur ne peut donc
    //    plus annuler son propre bon une fois qu'il est validé, sauf droit explicite.
    //  - Bon d'un AUTRE utilisateur → permission BON_ANNULER.
    //  - Son propre bon encore au statut CREE → autorisé sans permission.
    if (bon.statut === 'VALIDE') {
      await this.authz.assertPermission(userId, 'BON_ANNULER_VALIDE', 'annuler un bon déjà validé');
    }
    if (!isOwn) {
      await this.authz.assertPermission(userId, 'BON_ANNULER', "annuler le bon d'un autre utilisateur");
    }

    // Annulation en cascade : les sous-bons encore actifs (non décaissés) passent
    // ANNULE, et une demande d'extension encore en attente est neutralisée. Sinon ils
    // resteraient « en attente » (compteurs, file de décaissement) alors que le bon
    // est annulé — c'est le comportement remonté par les tests.
    return this.dataSource.transaction(async (manager) => {
      const sousBonRepo = manager.getRepository(SousBon);
      const bonRepo = manager.getRepository(Bon);
      const terminaux = ['DECAISSE', 'COMPTABILISE', 'ANNULE', 'REFUSE'];

      const sousBons = await sousBonRepo.find({ where: { bonId: bonId as any } });
      for (const sb of sousBons) {
        if (!terminaux.includes(sb.statut)) {
          sb.statut = 'ANNULE';
          sb.updatedById = userId as any;
          sb.updatedAt = new Date();
          await sousBonRepo.save(sb);
        }
      }

      bon.statut = 'ANNULE';
      if (bon.statutExtension === 'EN_ATTENTE') bon.statutExtension = 'NON';
      bon.updatedById = userId as any;
      bon.updatedAt = new Date();
      return bonRepo.save(bon);
    });
  }
}
