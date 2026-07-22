import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Credit } from './entities/credit.entity';
import { Caisse } from './entities/caisse.entity';
import { Portefeuille } from './entities/portefeuille.entity';
import { Employe } from '@modules/referentiel/entities/employe.entity';
import { User } from '@modules/security/entities/user.entity';
import { LedgerService } from '@modules/transactionnel/ledger.service';
import { AuthorizationService } from '@modules/security/authorization.service';
import { CreateCreditDto, UpdateCreditDto } from './dto/credit.dto';

@Injectable()
export class CreditService {
  constructor(
    @InjectRepository(Credit) private readonly creditRepo: Repository<Credit>,
    @InjectRepository(Employe) private readonly employeRepo: Repository<Employe>,
    private readonly dataSource: DataSource,
    private readonly ledger: LedgerService,
    private readonly authz: AuthorizationService,
  ) {}

  /** Direction de l'utilisateur courant (pour la restriction validateur). */
  private async directionOf(userId: string): Promise<string | null> {
    const u = await this.dataSource.getRepository(User).findOne({ where: { id: userId as any } });
    return u?.directionId ? String(u.directionId) : null;
  }

  /** Un non-admin ne peut agir que sur un employé de SA direction. */
  private async assertMemeDirection(userId: string, employe: Employe): Promise<void> {
    if (await this.authz.isAdmin(userId)) return;
    const dir = await this.directionOf(userId);
    if (!dir || String(employe.directionId ?? '') !== dir) {
      throw new ForbiddenException("Cet employé n'est pas dans votre direction.");
    }
  }

  async list(userId: string): Promise<Credit[]> {
    const isAdmin = await this.authz.isAdmin(userId);
    if (isAdmin) {
      return this.creditRepo.find({ order: { createdAt: 'DESC' } });
    }
    const dir = await this.directionOf(userId);
    if (!dir) return [];
    const employes = await this.employeRepo.find({ where: { directionId: dir as any } });
    const ids = employes.map((e) => e.id);
    if (ids.length === 0) return [];
    return this.creditRepo.find({ where: { employeId: In(ids) as any }, order: { createdAt: 'DESC' } });
  }

  async findOne(id: string): Promise<Credit> {
    const c = await this.creditRepo.findOne({ where: { id } });
    if (!c) throw new NotFoundException(`Crédit ${id} introuvable`);
    return c;
  }

  private async resolveSource(
    sourceType: 'CAISSE' | 'PORTEFEUILLE',
    sourceId: string,
  ): Promise<{ deviseId: string }> {
    if (sourceType === 'CAISSE') {
      const caisse = await this.dataSource.getRepository(Caisse).findOne({ where: { id: sourceId } });
      if (!caisse) throw new NotFoundException(`Caisse ${sourceId} introuvable`);
      if (caisse.statut !== 'OUVERTE') throw new BadRequestException(`La caisse ${caisse.code} est fermée`);
      return { deviseId: String(caisse.deviseId) };
    }
    const ptf = await this.dataSource.getRepository(Portefeuille).findOne({ where: { id: sourceId } });
    if (!ptf) throw new NotFoundException(`Portefeuille ${sourceId} introuvable`);
    return { deviseId: String(ptf.deviseId) };
  }

  /**
   * Accorde un crédit et décaisse réellement l'argent depuis la source.
   * Partie double : DÉBIT source (caisse/portefeuille ↓) / CRÉDIT créance employé.
   * Blocage d'un 2e crédit EN_COURS garanti par l'index unique filtré.
   */
  async create(dto: CreateCreditDto, userId: string): Promise<Credit> {
    const employe = await this.employeRepo.findOne({ where: { id: dto.employeId } });
    if (!employe) throw new NotFoundException(`Employé ${dto.employeId} introuvable`);
    await this.assertMemeDirection(userId, employe);

    if (Number(dto.montant) <= 0) throw new BadRequestException('Le montant doit être positif.');

    const dejaEnCours = await this.creditRepo.findOne({
      where: { employeId: dto.employeId, statut: 'EN_COURS' },
    });
    if (dejaEnCours) {
      throw new ConflictException('Cet employé a déjà un crédit en cours — soldez-le d\'abord.');
    }

    const { deviseId } = await this.resolveSource(dto.sourceType, dto.sourceId);

    try {
      return await this.dataSource.transaction(async (manager) => {
        const credit = manager.getRepository(Credit).create({
          employeId: dto.employeId,
          montant: dto.montant,
          nbMois: dto.nbMois,
          sourceType: dto.sourceType,
          sourceId: dto.sourceId,
          deviseId,
          statut: 'EN_COURS',
          dateDebut: new Date().toISOString().slice(0, 10),
          commentaire: dto.commentaire ?? null,
          createdById: userId as any,
        });
        const saved = await manager.getRepository(Credit).save(credit);

        const op = await this.ledger.createOperation(
          {
            typeOperation: 'CREDIT',
            caisseId: dto.sourceType === 'CAISSE' ? dto.sourceId : undefined,
            portefeuilleId: dto.sourceType === 'PORTEFEUILLE' ? dto.sourceId : undefined,
            montant: dto.montant,
            deviseId,
            userId,
            reference: `Crédit employé ${employe.matricule}`,
          },
          manager,
        );

        // DÉBIT source (l'argent sort) / CRÉDIT créance employé.
        const sourceAcc = { compteId: dto.sourceId, typeCompte: dto.sourceType, deviseId };
        const creanceAcc = { compteId: dto.employeId, typeCompte: 'CREDIT_EMPLOYE' as const, deviseId };
        await this.ledger.createPairedEcritures(sourceAcc, creanceAcc, dto.montant, op.transactionUuid, manager);

        saved.transactionUuid = op.transactionUuid;
        return manager.getRepository(Credit).save(saved);
      });
    } catch (err: any) {
      const num = err?.number ?? err?.driverError?.number;
      if (num === 2601 || num === 2627) {
        throw new ConflictException('Cet employé a déjà un crédit en cours — soldez-le d\'abord.');
      }
      throw err;
    }
  }

  /**
   * Modifie un crédit EN_COURS. Le nombre de mois est libre. Si le montant change,
   * une écriture d'ajustement décaisse (ou reprend) la différence sur la source.
   */
  async update(id: string, dto: UpdateCreditDto, userId: string): Promise<Credit> {
    const credit = await this.findOne(id);
    const employe = await this.employeRepo.findOne({ where: { id: credit.employeId } });
    if (employe) await this.assertMemeDirection(userId, employe);
    if (credit.statut !== 'EN_COURS') {
      throw new BadRequestException('Un crédit soldé n\'est plus modifiable.');
    }

    if (dto.nbMois !== undefined) credit.nbMois = dto.nbMois;
    if (dto.commentaire !== undefined) credit.commentaire = dto.commentaire || null;

    if (dto.montant !== undefined && Number(dto.montant) !== Number(credit.montant)) {
      if (Number(dto.montant) <= 0) throw new BadRequestException('Le montant doit être positif.');
      const delta = Number(dto.montant) - Number(credit.montant);
      const abs = Math.abs(delta).toFixed(4);
      return this.dataSource.transaction(async (manager) => {
        const op = await this.ledger.createOperation(
          {
            typeOperation: 'CREDIT',
            caisseId: credit.sourceType === 'CAISSE' ? credit.sourceId : undefined,
            portefeuilleId: credit.sourceType === 'PORTEFEUILLE' ? credit.sourceId : undefined,
            montant: abs,
            deviseId: credit.deviseId,
            userId,
            reference: `Ajustement crédit #${credit.id}`,
          },
          manager,
        );
        const sourceAcc = { compteId: credit.sourceId, typeCompte: credit.sourceType, deviseId: credit.deviseId };
        const creanceAcc = { compteId: credit.employeId, typeCompte: 'CREDIT_EMPLOYE' as const, deviseId: credit.deviseId };
        // delta > 0 : on décaisse plus (débit source). delta < 0 : on reprend (crédit source).
        if (delta > 0) {
          await this.ledger.createPairedEcritures(sourceAcc, creanceAcc, abs, op.transactionUuid, manager);
        } else {
          await this.ledger.createPairedEcritures(creanceAcc, sourceAcc, abs, op.transactionUuid, manager);
        }
        credit.montant = dto.montant as string;
        credit.updatedById = userId as any;
        return manager.getRepository(Credit).save(credit);
      });
    }

    credit.updatedById = userId as any;
    return this.creditRepo.save(credit);
  }

  /** Solde (clôture) un crédit : libère l'employé pour un nouveau crédit. */
  async solder(id: string, userId: string): Promise<Credit> {
    const credit = await this.findOne(id);
    const employe = await this.employeRepo.findOne({ where: { id: credit.employeId } });
    if (employe) await this.assertMemeDirection(userId, employe);
    credit.statut = 'SOLDE';
    credit.updatedById = userId as any;
    return this.creditRepo.save(credit);
  }
}
