import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { RemboursementBon } from './entities/remboursement-bon.entity';
import { SousBon } from './entities/sous-bon.entity';
import { Operation } from './entities/operation.entity';
import { LedgerService } from './ledger.service';
import { AuthorizationService } from '@modules/security/authorization.service';

export interface CreerRemboursementInput {
  sousBonId: string;
  montant: string;
  motif?: string;
}

/**
 * Retour à la caisse de ce qui n'a pas été dépensé sur un bon.
 *
 * Un bon de 100 000 décaissé pour une dépense réelle de 70 000 laisse 30 000 à
 * rendre. Rien ne permettait de les enregistrer : l'argent revenait dans le
 * tiroir sans trace, et la charge restait à 100 000 alors que 70 000 seulement
 * avaient été engagés.
 */
@Injectable()
export class RemboursementsBonService {
  constructor(
    @InjectRepository(RemboursementBon)
    private readonly repo: Repository<RemboursementBon>,
    @InjectRepository(SousBon)
    private readonly sousBonRepo: Repository<SousBon>,
    private readonly dataSource: DataSource,
    private readonly ledger: LedgerService,
    private readonly authz: AuthorizationService,
  ) {}

  /** Total déjà rendu sur un sous-bon. */
  async totalRembourse(sousBonId: string): Promise<string> {
    const [row] = await this.repo.query(
      `SELECT ISNULL(SUM(montant), 0) AS total FROM dbo.trx_remboursement_bon WHERE sous_bon_id = @0`,
      [sousBonId],
    );
    return String(row?.total ?? '0');
  }

  async listerParBon(bonId: string): Promise<RemboursementBon[]> {
    return this.repo.find({ where: { bonId: bonId as any }, order: { id: 'DESC' } });
  }

  /**
   * Enregistre un remboursement.
   *
   * Trois refus, dans cet ordre : un sous-bon non décaissé (rien n'est sorti,
   * rien ne peut revenir), un montant nul ou négatif (ce serait un décaissement
   * déguisé, échappant à tous ses contrôles), et un cumul dépassant ce qui a
   * été RÉELLEMENT décaissé — on ne rend pas plus qu'on n'a reçu.
   */
  async creer(input: CreerRemboursementInput, userId: string): Promise<RemboursementBon> {
    await this.authz.assertPermission(userId, 'BON_REMBOURSER', 'enregistrer un remboursement de bon');

    const sousBon = await this.sousBonRepo.findOne({ where: { id: input.sousBonId as any } });
    if (!sousBon) throw new NotFoundException(`Sous-bon ${input.sousBonId} introuvable`);

    if (sousBon.statut !== 'DECAISSE') {
      throw new BadRequestException(
        `Ce sous-bon est au statut ${sousBon.statut} : seul un sous-bon DÉCAISSÉ peut donner lieu à un remboursement.`,
      );
    }

    const montant = Number(input.montant);
    if (!Number.isFinite(montant) || montant <= 0) {
      throw new BadRequestException('Le montant remboursé doit être strictement positif.');
    }

    /*
     * Le montant RÉELLEMENT DÉCAISSÉ, pas celui du sous-bon : le caissier a pu
     * ajuster à la baisse au moment de payer. Rendre plus que ce qui est sorti
     * créerait de l'argent — ce que le grand livre existe pour empêcher.
     *
     * Le décaissement ne pointe pas le sous-bon directement : il passe par le
     * bon de caisse, la copie de travail du caissier.
     */
    const [ligne] = await this.repo.query(
      `SELECT ISNULL(SUM(d.montant), 0) AS total
         FROM dbo.trx_decaissement d
         JOIN dbo.trx_bon_caisse bc ON bc.id = d.bon_caisse_id
        WHERE bc.sous_bon_source_id = @0`,
      [input.sousBonId],
    );
    const sorti = Number(ligne?.total ?? 0);
    if (sorti <= 0) {
      throw new BadRequestException(
        "Aucun décaissement n'est enregistré pour ce sous-bon : il n'y a rien à rembourser.",
      );
    }
    const dejaRendu = Number(await this.totalRembourse(input.sousBonId));

    if (dejaRendu + montant > sorti) {
      const reste = sorti - dejaRendu;
      throw new BadRequestException(
        reste <= 0
          ? `La totalité de ce sous-bon a déjà été remboursée (${sorti.toFixed(4)}).`
          : `Remboursement trop élevé : ${sorti.toFixed(4)} ont été décaissés, ` +
            `${dejaRendu.toFixed(4)} déjà rendus, il reste ${reste.toFixed(4)}.`,
      );
    }

    const txUuid = uuidv4();
    const now = new Date();

    return this.dataSource.transaction(async (manager) => {
      await manager.getRepository(Operation).save(
        manager.getRepository(Operation).create({
          transactionUuid: txUuid,
          typeOperation: 'REMBOURSEMENT_BON',
          caisseId: sousBon.caisseId as any,
          portefeuilleId: sousBon.portefeuilleId as any,
          montant: montant.toFixed(4),
          deviseId: sousBon.deviseId as any,
          dateOperation: now,
          userId: userId as any,
          reference: `REMB-SB${sousBon.id}`,
          motif: input.motif ?? null,
        }),
      );

      /*
       * MIROIR EXACT DU DÉCAISSEMENT, qui fait DÉBIT portefeuille / CRÉDIT charge.
       *
       * Ici DÉBIT charge (elle retombe de 100 000 à 70 000) / CRÉDIT caisse
       * (l'argent est dans le tiroir). Le portefeuille n'est PAS recrédité :
       * décision métier du 17/08/2026 — le budget du mois reste consommé à
       * hauteur de ce qui avait été autorisé.
       */
      await this.ledger.createPairedEcritures(
        {
          compteId: String(sousBon.costCenterId),
          typeCompte: 'CHARGE',
          deviseId: String(sousBon.deviseId),
          costCenterId: String(sousBon.costCenterId),
          referenceSousBonId: String(sousBon.id),
          referenceBonId: String(sousBon.bonId),
        },
        {
          compteId: String(sousBon.caisseId),
          typeCompte: 'CAISSE',
          deviseId: String(sousBon.deviseId),
          costCenterId: String(sousBon.costCenterId),
        },
        montant.toFixed(4),
        txUuid,
        manager,
      );

      const remboursement = manager.getRepository(RemboursementBon).create({
        bonId: String(sousBon.bonId),
        sousBonId: String(sousBon.id),
        caisseId: String(sousBon.caisseId),
        deviseId: String(sousBon.deviseId),
        montant: montant.toFixed(4),
        motif: input.motif ?? null,
        transactionUuid: txUuid,
        createdById: userId as any,
      });
      return manager.getRepository(RemboursementBon).save(remboursement);
    });
  }
}
