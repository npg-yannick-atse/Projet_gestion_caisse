import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Bon } from './entities/bon.entity';
import { SousBon } from './entities/sous-bon.entity';
import { ImpressionBon } from './entities/impression-bon.entity';
import { BonCaisse } from './entities/bon-caisse.entity';
import { Decaissement } from './entities/decaissement.entity';
import { Operation } from './entities/operation.entity';
import { LedgerService } from './ledger.service';
import { UpdateBonCaisseDto } from './dto/bon-caisse.dto';

/**
 * Workflow caissier :
 *   prepare()  -> BonCaisse statut=PREPARE (snapshot du sous-bon)
 *   update()   -> ajustement beneficiaire / libelle / montant / commentaire
 *   finalize() -> BonCaisse statut=FINALISE + sous-bon DECAISSE + Operation/Decaissement
 *   cancel()   -> BonCaisse statut=ANNULE (le sous-bon reste VALIDE)
 */
@Injectable()
export class BonsCaisseService {
  constructor(
    @InjectRepository(BonCaisse)
    private readonly bonCaisseRepo: Repository<BonCaisse>,
    @InjectRepository(SousBon)
    private readonly sousBonRepo: Repository<SousBon>,
    @InjectRepository(Bon)
    private readonly bonRepo: Repository<Bon>,
    @InjectRepository(ImpressionBon)
    private readonly impressionBonRepo: Repository<ImpressionBon>,
    @InjectRepository(Decaissement)
    private readonly decaissementRepo: Repository<Decaissement>,
    @InjectRepository(Operation)
    private readonly operationRepo: Repository<Operation>,
    private readonly dataSource: DataSource,
    private readonly ledger: LedgerService,
  ) {}

  /**
   * Refuse le décaissement si le portefeuille passerait en négatif, sauf extension
   * approuvée en mode DECOUVERT pour le bon (cf. circuit d'approbation d'extension).
   */
  private async assertSoldeSuffisant(
    portefeuilleId: string,
    montant: string,
    bonId: string,
  ): Promise<void> {
    const solde = Number(await this.ledger.calculateBalance(portefeuilleId, 'PORTEFEUILLE'));
    if (solde - Number(montant) >= 0) return;
    const bon = await this.bonRepo.findOne({ where: { id: bonId } });
    if (bon?.statutExtension === 'APPROUVEE' && bon.extensionMode === 'DECOUVERT') return;
    throw new BadRequestException(
      'Solde du portefeuille insuffisant pour ce décaissement : une extension de budget ' +
        '(approuvée en mode découvert) ou une recharge préalable est nécessaire.',
    );
  }

  /**
   * Cree une copie de travail (BonCaisse statut=PREPARE) a partir d'un sous-bon VALIDE.
   * Refuse si :
   *  - le bon parent n'est ni imprime ni signe ;
   *  - le sous-bon n'est pas en statut VALIDE ;
   *  - un BonCaisse en PREPARE existe deja pour ce sous-bon.
   */
  async prepareDecaissement(
    bonId: string,
    sousBonId: string,
    userId: string,
  ): Promise<BonCaisse> {
    const bon = await this.bonRepo.findOne({ where: { id: bonId } });
    if (!bon) throw new NotFoundException(`Bon ${bonId} introuvable`);

    const sousBon = await this.sousBonRepo.findOne({ where: { id: sousBonId } });
    if (!sousBon) throw new NotFoundException(`Sous-bon ${sousBonId} introuvable`);

    if (String(sousBon.bonId) !== String(bonId)) {
      throw new BadRequestException(
        `Sous-bon ${sousBonId} n'appartient pas au bon ${bonId}`,
      );
    }

    if (sousBon.statut !== 'VALIDE') {
      throw new BadRequestException(
        `Sous-bon doit etre VALIDE pour preparer un decaissement (actuel : ${sousBon.statut})`,
      );
    }

    // NB : l'impression + signature du bon n'est plus exigée avant le décaissement
    // (règle assouplie à la demande métier).

    // Verrou metier : un seul PREPARE actif par sous-bon
    const existant = await this.bonCaisseRepo.findOne({
      where: { sousBonSourceId: sousBonId as any, statut: 'PREPARE' },
    });
    if (existant) {
      throw new ConflictException(
        `Une preparation est deja en cours pour le sous-bon ${sousBonId} (BonCaisse ${existant.id})`,
      );
    }

    const now = new Date();

    // Snapshot original conservé dans contenuModifie pour audit ulterieur
    const snapshot = {
      original: {
        sousBonId: sousBon.id,
        bonId: sousBon.bonId,
        libelle: sousBon.libelle,
        montant: sousBon.montant,
        deviseId: sousBon.deviseId,
        caisseId: sousBon.caisseId,
        portefeuilleId: sousBon.portefeuilleId,
        partenaireId: sousBon.partenaireId,
      },
      modified: null,
      preparedAt: now.toISOString(),
      preparedBy: userId,
    };

    const bonCaisse = this.bonCaisseRepo.create({
      uuid: uuidv4(),
      bonSourceId: bonId as any,
      sousBonSourceId: sousBonId as any,
      caissierId: userId as any,
      dateDuplication: now,
      contenuModifie: JSON.stringify(snapshot),
      beneficiaire: null,
      beneficiairePiece: null,
      libelleAjuste: null,
      montantAjuste: null,
      commentaire: null,
      statut: 'PREPARE',
      createdById: userId as any,
    });

    return this.bonCaisseRepo.save(bonCaisse);
  }

  /**
   * Met a jour les champs editables d'un BonCaisse en PREPARE.
   * Met aussi a jour le JSON contenuModifie.modified pour audit.
   */
  async updateBonCaisse(
    id: string,
    dto: UpdateBonCaisseDto,
    userId: string,
  ): Promise<BonCaisse> {
    const bonCaisse = await this.bonCaisseRepo.findOne({ where: { id } });
    if (!bonCaisse) throw new NotFoundException(`BonCaisse ${id} introuvable`);

    if (bonCaisse.statut !== 'PREPARE') {
      throw new BadRequestException(
        `BonCaisse ${id} ne peut plus etre modifie (statut : ${bonCaisse.statut})`,
      );
    }

    if (dto.beneficiaire !== undefined) {
      bonCaisse.beneficiaire = dto.beneficiaire?.trim() || null;
    }
    if (dto.beneficiairePiece !== undefined) {
      bonCaisse.beneficiairePiece = dto.beneficiairePiece?.trim() || null;
    }
    if (dto.libelleAjuste !== undefined) {
      bonCaisse.libelleAjuste = dto.libelleAjuste?.trim() || null;
    }
    if (dto.montantAjuste !== undefined) {
      bonCaisse.montantAjuste = dto.montantAjuste || null;
    }
    if (dto.commentaire !== undefined) {
      bonCaisse.commentaire = dto.commentaire?.trim() || null;
    }

    // Mise a jour du JSON d'audit (.modified et timestamp)
    let snapshot: any = {};
    try {
      snapshot = bonCaisse.contenuModifie ? JSON.parse(bonCaisse.contenuModifie) : {};
    } catch {
      snapshot = {};
    }
    snapshot.modified = {
      beneficiaire: bonCaisse.beneficiaire,
      beneficiairePiece: bonCaisse.beneficiairePiece,
      libelleAjuste: bonCaisse.libelleAjuste,
      montantAjuste: bonCaisse.montantAjuste,
      commentaire: bonCaisse.commentaire,
    };
    snapshot.lastEditedAt = new Date().toISOString();
    snapshot.lastEditedBy = userId;
    bonCaisse.contenuModifie = JSON.stringify(snapshot);

    bonCaisse.updatedById = userId as any;
    bonCaisse.updatedAt = new Date();

    return this.bonCaisseRepo.save(bonCaisse);
  }

  /**
   * Finalise le decaissement :
   *  - BonCaisse statut PREPARE -> FINALISE + dateDecaissement
   *  - cree l'enregistrement Decaissement
   *  - cree l'Operation au ledger (type DECAISSEMENT)
   *  - sous-bon source VALIDE -> DECAISSE
   *  - si TOUS les sous-bons du bon sont DECAISSE alors bon VALIDE -> DECAISSE
   *
   * Tout est encapsule dans une transaction unique.
   */
  async finalizeDecaissement(bonCaisseId: string, userId: string): Promise<BonCaisse> {
    return this.dataSource.transaction(async (manager) => {
      const bonCaisseRepo = manager.getRepository(BonCaisse);
      const sousBonRepo = manager.getRepository(SousBon);
      const bonRepo = manager.getRepository(Bon);
      const decaissementRepo = manager.getRepository(Decaissement);
      const operationRepo = manager.getRepository(Operation);

      const bonCaisse = await bonCaisseRepo.findOne({ where: { id: bonCaisseId } });
      if (!bonCaisse) throw new NotFoundException(`BonCaisse ${bonCaisseId} introuvable`);

      if (bonCaisse.statut !== 'PREPARE') {
        throw new BadRequestException(
          `BonCaisse ${bonCaisseId} ne peut etre finalise depuis le statut ${bonCaisse.statut}`,
        );
      }

      if (!bonCaisse.beneficiaire || !bonCaisse.beneficiaire.trim()) {
        throw new BadRequestException(
          'Le beneficiaire est obligatoire pour finaliser le decaissement',
        );
      }

      if (!bonCaisse.sousBonSourceId) {
        throw new BadRequestException(
          'BonCaisse non rattache a un sous-bon : finalisation impossible',
        );
      }

      const sousBon = await sousBonRepo.findOne({
        where: { id: bonCaisse.sousBonSourceId },
      });
      if (!sousBon) {
        throw new NotFoundException(
          `Sous-bon source ${bonCaisse.sousBonSourceId} introuvable`,
        );
      }

      // Garde-fou concurrent : un autre canal a deja decaisse le sous-bon
      if (sousBon.statut === 'DECAISSE') {
        // On marque le BonCaisse comme ANNULE pour eviter un doublon de decaissement
        bonCaisse.statut = 'ANNULE';
        bonCaisse.commentaire = (bonCaisse.commentaire ?? '') +
          ' [auto] Sous-bon deja decaisse par un autre canal.';
        bonCaisse.updatedById = userId as any;
        bonCaisse.updatedAt = new Date();
        await bonCaisseRepo.save(bonCaisse);
        throw new ConflictException(
          `Sous-bon ${sousBon.id} est deja decaisse ; BonCaisse passe a ANNULE.`,
        );
      }

      if (sousBon.statut !== 'VALIDE') {
        throw new BadRequestException(
          `Sous-bon doit etre VALIDE pour etre decaisse (actuel : ${sousBon.statut})`,
        );
      }

      // Montant et libelle effectifs (priorite aux ajustements caissier)
      const montantEffectif = bonCaisse.montantAjuste ?? sousBon.montant;

      // Garde de solde : refuse le décaissement si le portefeuille deviendrait négatif,
      // sauf si une extension a été approuvée en mode DECOUVERT pour ce bon.
      await this.assertSoldeSuffisant(
        String(sousBon.portefeuilleId),
        String(montantEffectif),
        String(sousBon.bonId),
      );

      const now = new Date();

      // 1) Finalise le BonCaisse
      bonCaisse.statut = 'FINALISE';
      bonCaisse.dateDecaissement = now;
      bonCaisse.updatedById = userId as any;
      bonCaisse.updatedAt = now;
      await bonCaisseRepo.save(bonCaisse);

      // 2) Cree l'enregistrement de decaissement
      await decaissementRepo.save(
        decaissementRepo.create({
          bonCaisseId: bonCaisse.id as any,
          caissierId: userId as any,
          beneficiaireNom: bonCaisse.beneficiaire!,
          beneficiairePiece: bonCaisse.beneficiairePiece ?? null,
          montant: montantEffectif,
          dateDecaissement: now,
          portefeuilleId: sousBon.portefeuilleId as any,
        }),
      );

      // 3) Ligne d'operation au ledger + écritures en partie double (cf. Dossier)
      const txUuid = uuidv4();
      await operationRepo.save(
        operationRepo.create({
          transactionUuid: txUuid,
          typeOperation: 'DECAISSEMENT',
          caisseId: sousBon.caisseId as any,
          portefeuilleId: sousBon.portefeuilleId as any,
          montant: montantEffectif,
          deviseId: sousBon.deviseId as any,
          dateOperation: now,
          userId: userId as any,
          reference: `BC-${bonCaisse.id}`,
        }),
      );

      // DÉBIT portefeuille (le solde baisse) / CRÉDIT charge imputée au centre de coût.
      await this.ledger.createPairedEcritures(
        { compteId: sousBon.portefeuilleId, typeCompte: 'PORTEFEUILLE', deviseId: sousBon.deviseId, costCenterId: sousBon.costCenterId },
        { compteId: sousBon.costCenterId, typeCompte: 'CHARGE', deviseId: sousBon.deviseId, costCenterId: sousBon.costCenterId },
        montantEffectif,
        txUuid,
        manager,
      );

      // 4) Passe le sous-bon en DECAISSE
      sousBon.statut = 'DECAISSE';
      sousBon.dateDecaissement = now;
      sousBon.updatedById = userId as any;
      sousBon.updatedAt = now;
      await sousBonRepo.save(sousBon);

      // 5) Si tous les sous-bons du bon parent sont DECAISSE, on passe le bon en DECAISSE
      if (bonCaisse.bonSourceId) {
        const freres = await sousBonRepo.find({
          where: { bonId: bonCaisse.bonSourceId as any },
        });
        const tousDecaisses = freres.length > 0 && freres.every((sb) => sb.statut === 'DECAISSE');
        if (tousDecaisses) {
          const bon = await bonRepo.findOne({ where: { id: bonCaisse.bonSourceId } });
          if (bon && bon.statut !== 'DECAISSE') {
            bon.statut = 'DECAISSE';
            bon.updatedById = userId as any;
            bon.updatedAt = now;
            await bonRepo.save(bon);
          }
        }
      }

      return bonCaisse;
    });
  }

  /**
   * Annule la preparation. Le sous-bon source reste VALIDE.
   * Refuse si deja FINALISE.
   */
  async cancelPrepare(id: string, userId: string): Promise<BonCaisse> {
    const bonCaisse = await this.bonCaisseRepo.findOne({ where: { id } });
    if (!bonCaisse) throw new NotFoundException(`BonCaisse ${id} introuvable`);

    if (bonCaisse.statut === 'FINALISE') {
      throw new BadRequestException(
        `BonCaisse ${id} est deja finalise, annulation impossible`,
      );
    }

    if (bonCaisse.statut === 'ANNULE') {
      return bonCaisse;
    }

    bonCaisse.statut = 'ANNULE';
    bonCaisse.updatedById = userId as any;
    bonCaisse.updatedAt = new Date();
    return this.bonCaisseRepo.save(bonCaisse);
  }

  async findOne(id: string): Promise<BonCaisse> {
    const bc = await this.bonCaisseRepo.findOne({ where: { id } });
    if (!bc) throw new NotFoundException(`BonCaisse ${id} introuvable`);
    return bc;
  }

  async findByBon(bonId: string): Promise<BonCaisse[]> {
    return this.bonCaisseRepo.find({
      where: { bonSourceId: bonId as any },
      order: { createdAt: 'DESC' },
    });
  }

  async findBySousBon(sousBonId: string): Promise<BonCaisse[]> {
    return this.bonCaisseRepo.find({
      where: { sousBonSourceId: sousBonId as any },
      order: { createdAt: 'DESC' },
    });
  }
}
