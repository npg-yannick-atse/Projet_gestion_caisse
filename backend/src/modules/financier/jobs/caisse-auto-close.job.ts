import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CaissesService } from '../caisses.service';

/**
 * Expression cron et fuseau horaire de la clôture automatique des caisses.
 * Par défaut : tous les jours à 20h00, heure de Côte d'Ivoire (siège NPG Gandour).
 * Surchargeable via les variables d'environnement `CAISSE_AUTO_CLOSE_CRON`
 * et `CAISSE_AUTO_CLOSE_TZ` (utile pour les tests, ex. « toutes les minutes »).
 */
const CRON = process.env.CAISSE_AUTO_CLOSE_CRON || '0 20 * * *';
const TZ = process.env.CAISSE_AUTO_CLOSE_TZ || 'Africa/Abidjan';

/**
 * Job planifié : clôture chaque soir les caisses restées ouvertes (type AUTO_20H).
 * La logique métier vit dans `CaissesService.autoCloseAll()` — ce job ne fait
 * que la déclencher à l'heure dite. Les erreurs sont capturées et journalisées
 * pour ne jamais faire planter le planificateur.
 */
@Injectable()
export class CaisseAutoCloseJob {
  private readonly logger = new Logger('CaisseAutoCloseJob');

  constructor(private readonly caissesService: CaissesService) {}

  @Cron(CRON, { name: 'caisse-auto-close', timeZone: TZ })
  async handleCron(): Promise<void> {
    try {
      const { closed, failed } = await this.caissesService.autoCloseAll();
      if (closed > 0 || failed > 0) {
        this.logger.log(`Clôture automatique déclenchée : ${closed} clôturée(s), ${failed} échec(s).`);
      }
    } catch (e) {
      this.logger.error(`Clôture automatique 20h échouée : ${(e as Error).message}`);
    }
  }
}
