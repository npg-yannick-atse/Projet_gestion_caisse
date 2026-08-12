import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Bon } from '../entities/bon.entity';
import { PushService } from '@modules/notifications/push.service';
import { reporterApres } from '../recurrence';

/** Même fuseau de référence que la clôture automatique (siège NPG Gandour). */
const TZ = process.env.CAISSE_AUTO_CLOSE_TZ || 'Africa/Abidjan';

/** Filet : au-delà, quelque chose ne va pas et mieux vaut le voir dans les logs. */
const MAX_PAR_PASSAGE = 200;

/**
 * Rappel des bons récurrents.
 *
 * Chaque matin, les bons dont l'échéance est atteinte déclenchent une
 * notification au demandeur, puis leur échéance est reportée d'une période.
 *
 * Le report est fait dans la FOULÉE de l'envoi, bon par bon : si le job
 * s'interrompt au milieu, les bons déjà traités ne le seront pas une seconde
 * fois demain.
 *
 * Une journée sautée (serveur éteint) n'est pas perdue : la comparaison porte
 * sur `<= aujourd'hui`, le bon en retard est donc pris au passage suivant. Et
 * le report saute d'un coup toutes les périodes manquées, pour ne pas notifier
 * cinq fois un bon oublié cinq mois.
 */
@Injectable()
export class BonRecurrenceJob {
  private readonly logger = new Logger('BonRecurrenceJob');

  constructor(
    @InjectRepository(Bon)
    private readonly bonRepo: Repository<Bon>,
    private readonly push: PushService,
  ) {}

  /** Aujourd'hui, ramené au jour (UTC) : une échéance est un jour, pas un instant. */
  private aujourdHui(): Date {
    const n = new Date();
    return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
  }

  @Cron('0 7 * * *', { name: 'bon-recurrence', timeZone: TZ })
  async handleCron(): Promise<void> {
    try {
      const jour = this.aujourdHui();
      const jourIso = jour.toISOString().slice(0, 10);

      const dus = await this.bonRepo
        .createQueryBuilder('bon')
        .where('bon.est_recurrent = 1')
        .andWhere('bon.date_prochaine_echeance IS NOT NULL')
        .andWhere('bon.date_prochaine_echeance <= :jour', { jour: jourIso })
        // Un bon annulé ou refusé ne se renouvelle pas : la dépense a été écartée.
        .andWhere("bon.statut NOT IN ('ANNULE', 'REFUSE')")
        .orderBy('bon.date_prochaine_echeance', 'ASC')
        .take(MAX_PAR_PASSAGE)
        .getMany();

      if (dus.length === 0) return;

      for (const bon of dus) {
        // Le bon est reporté même si la notification échoue : sans cela, un
        // demandeur sans téléphone enregistré relancerait le rappel chaque jour.
        await this.push.notifyEcheanceRecurrence(String(bon.demandeurId), {
          id: String(bon.id),
          numero: bon.numero,
          montantTotal: String(bon.montantTotal),
        });

        const courante = new Date(`${String(bon.dateProchaineEcheance).slice(0, 10)}T00:00:00.000Z`);
        const suivante = reporterApres(courante, bon.frequenceRecurrence ?? 'MENSUEL', jour);
        await this.bonRepo.update(bon.id, {
          dateProchaineEcheance: suivante.toISOString().slice(0, 10),
        });
      }

      this.logger.log(`${dus.length} bon(s) récurrent(s) rappelé(s).`);
    } catch (e) {
      // Un job planifié qui jette laisse une trace illisible : on la rend nette.
      this.logger.error(`Rappel des bons récurrents échoué : ${(e as Error).message}`);
    }
  }
}
