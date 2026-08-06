import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Credit } from './entities/credit.entity';
import { CreditRemboursement } from './entities/credit-remboursement.entity';
import { Caisse } from './entities/caisse.entity';
import { Employe } from '@modules/referentiel/entities/employe.entity';
import { LedgerService } from '@modules/transactionnel/ledger.service';
import { AuthorizationService } from '@modules/security/authorization.service';
import { CreateRemboursementDto } from './dto/credit-remboursement.dto';

/** Situation d'un crédit à un instant donné — ce que l'écran affiche. */
export interface SituationCredit {
  creditId: string;
  montant: string;
  nbMois: number;
  /** Montant théorique d'une mensualité (montant ÷ nbMois), arrondi au centime. */
  mensualite: string;
  /** Somme réellement encaissée. */
  rembourse: string;
  /** Ce qu'il reste à rembourser (jamais négatif). */
  restant: string;
  /** Nombre d'échéances effectivement encaissées. */
  echeancesPayees: number;
  /** Rang de la prochaine échéance à encaisser, null si tout est soldé. */
  prochaineEcheance: number | null;
  /** Nombre d'échéances dont la date est passée sans versement. */
  echeancesEnRetard: number;
  /** Montant correspondant à ces échéances en retard. */
  montantEnRetard: string;
  /** Avancement en pourcentage du montant remboursé. */
  pourcentage: number;
}

@Injectable()
export class CreditRemboursementService {
  constructor(
    @InjectRepository(Credit) private readonly creditRepo: Repository<Credit>,
    @InjectRepository(CreditRemboursement)
    private readonly rembRepo: Repository<CreditRemboursement>,
    @InjectRepository(Employe) private readonly employeRepo: Repository<Employe>,
    private readonly dataSource: DataSource,
    private readonly ledger: LedgerService,
    private readonly authz: AuthorizationService,
  ) {}

  private static readonly CENT = 4;

  /** Format DECIMAL(19,4), comme partout ailleurs dans le grand livre. */
  private static fmt(n: number): string {
    return n.toFixed(CreditRemboursementService.CENT);
  }

  /** Date d'échéance du rang `rang` (1 = un mois après le début du crédit). */
  static dateEcheance(dateDebut: string, rang: number): Date {
    const d = new Date(dateDebut);
    d.setMonth(d.getMonth() + rang);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  /**
   * Mensualité théorique. Le dernier mois absorbe l'arrondi : sur 100 000 en
   * 3 mois, deux versements de 33 333,33 et un de 33 333,34 — sinon le crédit
   * ne se solderait jamais exactement.
   */
  static mensualite(montant: string, nbMois: number, rang?: number): string {
    const total = Number(montant || 0);
    if (nbMois <= 0) return CreditRemboursementService.fmt(0);
    const base = Math.floor((total / nbMois) * 100) / 100;
    if (rang !== undefined && rang >= nbMois) {
      return CreditRemboursementService.fmt(total - base * (nbMois - 1));
    }
    return CreditRemboursementService.fmt(base);
  }

  async findCredit(creditId: string): Promise<Credit> {
    const c = await this.creditRepo.findOne({ where: { id: creditId } });
    if (!c) throw new NotFoundException(`Crédit ${creditId} introuvable`);
    return c;
  }

  /** Remboursements encaissés d'un crédit, du plus ancien au plus récent. */
  async list(creditId: string): Promise<CreditRemboursement[]> {
    return this.rembRepo.find({
      where: { creditId: creditId as any },
      order: { numeroEcheance: 'ASC' },
    });
  }

  /**
   * Situation d'un crédit, calculée sur les versements RÉELLEMENT encaissés.
   *
   * Le retard se mesure en comparant les échéances dont la date est passée au
   * nombre de versements reçus : c'est exactement ce que l'ancien affichage ne
   * savait pas faire, puisqu'il supposait toute échéance passée comme payée.
   */
  async situation(creditId: string, aujourdhui = new Date()): Promise<SituationCredit> {
    const credit = await this.findCredit(creditId);
    return this.calculerSituation(credit, await this.list(creditId), aujourdhui);
  }

  /** Cœur du calcul, sans accès base — partagé par `situation` et `situations`. */
  private calculerSituation(
    credit: Credit,
    tousRemboursements: CreditRemboursement[],
    aujourdhui = new Date(),
  ): SituationCredit {
    const remboursements = tousRemboursements.filter((r) => r.statut === 'ENCAISSE');

    const total = Number(credit.montant || 0);
    const rembourse = remboursements.reduce((s, r) => s + Number(r.montant || 0), 0);
    const restant = Math.max(0, total - rembourse);
    const payees = new Set(remboursements.map((r) => r.numeroEcheance));

    let prochaine: number | null = null;
    for (let i = 1; i <= credit.nbMois; i++) {
      if (!payees.has(i)) {
        prochaine = i;
        break;
      }
    }

    // Échéances échues mais non encaissées. Un crédit non décaissé n'a pas
    // encore d'échéancier qui court : rien ne peut être en retard.
    const jour = new Date(aujourdhui);
    jour.setHours(0, 0, 0, 0);
    let enRetard = 0;
    let montantRetard = 0;
    if (credit.statut === 'EN_COURS') {
      for (let i = 1; i <= credit.nbMois; i++) {
        if (payees.has(i)) continue;
        if (CreditRemboursementService.dateEcheance(credit.dateDebut, i).getTime() <= jour.getTime()) {
          enRetard += 1;
          montantRetard += Number(CreditRemboursementService.mensualite(credit.montant, credit.nbMois, i));
        }
      }
    }

    return {
      creditId: String(credit.id),
      montant: CreditRemboursementService.fmt(total),
      nbMois: credit.nbMois,
      mensualite: CreditRemboursementService.mensualite(credit.montant, credit.nbMois),
      rembourse: CreditRemboursementService.fmt(rembourse),
      restant: CreditRemboursementService.fmt(restant),
      echeancesPayees: payees.size,
      prochaineEcheance: prochaine,
      echeancesEnRetard: enRetard,
      montantEnRetard: CreditRemboursementService.fmt(montantRetard),
      pourcentage: total > 0 ? Math.min(100, Math.round((rembourse / total) * 100)) : 0,
    };
  }

  /**
   * Situations de plusieurs crédits — pour l'affichage de la liste.
   *
   * Deux requêtes au total, pas deux PAR crédit : la liste des crédits est
   * affichée à chaque ouverture de l'écran, un N+1 s'y verrait vite.
   */
  async situations(creditIds: string[]): Promise<Record<string, SituationCredit>> {
    const out: Record<string, SituationCredit> = {};
    if (creditIds.length === 0) return out;

    const credits = await this.creditRepo.find({ where: { id: In(creditIds) as any } });
    const remboursements = await this.rembRepo.find({
      where: { creditId: In(creditIds) as any },
      order: { numeroEcheance: 'ASC' },
    });
    const parCredit = new Map<string, CreditRemboursement[]>();
    for (const r of remboursements) {
      const cle = String(r.creditId);
      if (!parCredit.has(cle)) parCredit.set(cle, []);
      parCredit.get(cle)!.push(r);
    }

    for (const credit of credits) {
      out[String(credit.id)] = this.calculerSituation(credit, parCredit.get(String(credit.id)) ?? []);
    }
    return out;
  }

  /** Une caisse qui encaisse doit être ouverte (un portefeuille l'est toujours). */
  private async assertSourceOuverte(sourceType: string, sourceId: string): Promise<void> {
    if (sourceType !== 'CAISSE') return;
    const caisse = await this.dataSource.getRepository(Caisse).findOne({ where: { id: sourceId } });
    if (!caisse) throw new NotFoundException(`Caisse ${sourceId} introuvable`);
    if (caisse.statut !== 'OUVERTE') throw new BadRequestException(`La caisse ${caisse.code} est fermée`);
  }

  /**
   * Enregistre un versement réellement encaissé.
   *
   * Partie double INVERSE du décaissement : DÉBIT créance employé (la dette
   * diminue) / CRÉDIT source (l'argent revient). Le crédit passe SOLDE dès que
   * la totalité est remboursée — c'est ce qui libère l'employé pour un
   * nouveau crédit (index unique UQ_fin_credit_actif).
   */
  async enregistrer(
    creditId: string,
    dto: CreateRemboursementDto,
    userId: string,
  ): Promise<CreditRemboursement> {
    const credit = await this.findCredit(creditId);
    if (credit.statut !== 'EN_COURS') {
      throw new BadRequestException(
        'Seul un crédit en cours peut être remboursé — un crédit non décaissé ne doit rien.',
      );
    }

    const sourceType = dto.sourceType ?? credit.sourceType;
    const sourceId = dto.sourceId ?? credit.sourceId;
    if (sourceType === 'CAISSE') {
      await this.authz.assertCaisseInPerimeter(userId, sourceId);
    } else {
      await this.authz.assertPortefeuilleInPerimeter(userId, sourceId);
    }
    await this.assertSourceOuverte(sourceType, sourceId);

    const situation = await this.situation(creditId);
    const rang = dto.numeroEcheance ?? situation.prochaineEcheance;
    if (rang === null || rang === undefined) {
      throw new BadRequestException('Toutes les échéances de ce crédit sont déjà encaissées.');
    }
    if (rang < 1 || rang > credit.nbMois) {
      throw new BadRequestException(
        `L'échéance doit être comprise entre 1 et ${credit.nbMois}.`,
      );
    }

    const montant = dto.montant ?? CreditRemboursementService.mensualite(credit.montant, credit.nbMois, rang);
    if (Number(montant) <= 0) throw new BadRequestException('Le montant doit être positif.');
    // Un versement ne peut pas dépasser ce qui reste dû : sinon la créance
    // deviendrait négative et l'employé serait créditeur de l'entreprise.
    if (Number(montant) > Number(situation.restant) + 0.005) {
      throw new BadRequestException(
        `Ce versement dépasse le reste dû (${situation.restant}).`,
      );
    }

    const employe = await this.employeRepo.findOne({ where: { id: credit.employeId } });

    try {
      return await this.dataSource.transaction(async (manager) => {
        const op = await this.ledger.createOperation(
          {
            typeOperation: 'REMBOURSEMENT_CREDIT',
            caisseId: sourceType === 'CAISSE' ? sourceId : undefined,
            portefeuilleId: sourceType === 'PORTEFEUILLE' ? sourceId : undefined,
            montant,
            deviseId: credit.deviseId,
            userId,
            reference: `Remboursement crédit ${employe?.matricule ?? credit.employeId} — échéance ${rang}/${credit.nbMois}`,
          },
          manager,
        );

        // DÉBIT créance employé (la dette diminue) / CRÉDIT source (l'argent rentre).
        const creanceAcc = {
          compteId: credit.employeId,
          typeCompte: 'CREDIT_EMPLOYE' as const,
          deviseId: credit.deviseId,
        };
        const sourceAcc = { compteId: sourceId, typeCompte: sourceType as any, deviseId: credit.deviseId };
        await this.ledger.createPairedEcritures(creanceAcc, sourceAcc, montant, op.transactionUuid, manager);

        const remb = await manager.getRepository(CreditRemboursement).save(
          manager.getRepository(CreditRemboursement).create({
            creditId: creditId as any,
            numeroEcheance: rang,
            montant,
            deviseId: credit.deviseId,
            sourceType: sourceType as any,
            sourceId: sourceId as any,
            transactionUuid: op.transactionUuid,
            dateRemboursement: dto.dateRemboursement ? new Date(dto.dateRemboursement) : new Date(),
            statut: 'ENCAISSE',
            commentaire: dto.commentaire ?? null,
            createdById: userId as any,
          }),
        );

        // Solde automatique : dès que la dette est éteinte, le crédit se ferme
        // et l'employé redevient éligible.
        const totalApres = Number(situation.rembourse) + Number(montant);
        if (totalApres >= Number(credit.montant) - 0.005) {
          credit.statut = 'SOLDE';
          credit.updatedById = userId as any;
          await manager.getRepository(Credit).save(credit);
        }

        return remb;
      });
    } catch (err: any) {
      const num = err?.number ?? err?.driverError?.number;
      if (num === 2601 || num === 2627) {
        throw new ConflictException(`L'échéance ${rang} de ce crédit est déjà encaissée.`);
      }
      throw err;
    }
  }

  /**
   * Annule un versement saisi par erreur : contre-passation comptable, la ligne
   * reste visible en ANNULE. Rien n'est supprimé — le grand livre ne se réécrit
   * pas. Si le crédit avait été soldé par ce versement, il repasse EN_COURS.
   */
  async annuler(remboursementId: string, userId: string, motif?: string): Promise<CreditRemboursement> {
    const remb = await this.rembRepo.findOne({ where: { id: remboursementId } });
    if (!remb) throw new NotFoundException(`Remboursement ${remboursementId} introuvable`);
    if (remb.statut !== 'ENCAISSE') {
      throw new BadRequestException('Ce remboursement est déjà annulé.');
    }
    const credit = await this.findCredit(String(remb.creditId));
    await this.assertSourceOuverte(remb.sourceType, String(remb.sourceId));

    return this.dataSource.transaction(async (manager) => {
      const op = await this.ledger.createOperation(
        {
          typeOperation: 'REMBOURSEMENT_CREDIT',
          caisseId: remb.sourceType === 'CAISSE' ? String(remb.sourceId) : undefined,
          portefeuilleId: remb.sourceType === 'PORTEFEUILLE' ? String(remb.sourceId) : undefined,
          montant: remb.montant,
          deviseId: String(remb.deviseId),
          userId,
          reference: `Annulation remboursement échéance ${remb.numeroEcheance}`,
        },
        manager,
      );

      // Contre-passation : on remet l'argent en sortie et la créance en dette.
      const sourceAcc = {
        compteId: String(remb.sourceId),
        typeCompte: remb.sourceType as any,
        deviseId: String(remb.deviseId),
      };
      const creanceAcc = {
        compteId: credit.employeId,
        typeCompte: 'CREDIT_EMPLOYE' as const,
        deviseId: String(remb.deviseId),
      };
      await this.ledger.createPairedEcritures(sourceAcc, creanceAcc, remb.montant, op.transactionUuid, manager);

      remb.statut = 'ANNULE';
      remb.commentaire = motif ? `${remb.commentaire ?? ''} | Annulé : ${motif}`.trim() : remb.commentaire;
      remb.updatedById = userId as any;
      const saved = await manager.getRepository(CreditRemboursement).save(remb);

      if (credit.statut === 'SOLDE') {
        credit.statut = 'EN_COURS';
        credit.updatedById = userId as any;
        await manager.getRepository(Credit).save(credit);
      }

      return saved;
    });
  }
}
