import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CaissesService } from '../caisses.service';
import { ParametresService } from '@modules/referentiel/parametres.service';

/** Fuseau horaire de référence pour l'heure de clôture (siège NPG Gandour). */
const TZ = process.env.CAISSE_AUTO_CLOSE_TZ || 'Africa/Abidjan';

/** Clés de configuration (modifiables depuis la page Paramètres, sans redéploiement). */
const K_ENABLED = 'CAISSE_AUTO_CLOSE_ENABLED';
const K_HEURE = 'CAISSE_AUTO_CLOSE_HEURE';
const K_MINUTE = 'CAISSE_AUTO_CLOSE_MINUTE';

/**
 * Job planifié : clôture les caisses restées ouvertes à l'heure configurée.
 * La configuration (activé / heure / minute) vit en BASE (paramètres applicatifs)
 * et non plus dans le cron : ce job tourne chaque minute et déclenche la clôture
 * seulement à l'instant configuré. Ainsi le réglage se modifie depuis la page
 * Paramètres sans redémarrer le serveur.
 *
 * NB : en cas de minute « ratée » (serveur en veille / éteint à l'heure dite),
 * la clôture n'est PAS rejouée au réveil — elle attend la prochaine occurrence.
 */
@Injectable()
export class CaisseAutoCloseJob {
  private readonly logger = new Logger('CaisseAutoCloseJob');

  constructor(
    private readonly caissesService: CaissesService,
    private readonly parametres: ParametresService,
  ) {}

  /** Heure/minute courantes dans le fuseau de référence. */
  private nowInTz(): { h: number; m: number } {
    const parts = new Intl.DateTimeFormat('fr-FR', {
      timeZone: TZ,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(new Date());
    const h = Number(parts.find((p) => p.type === 'hour')?.value ?? '0') % 24;
    const m = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
    return { h, m };
  }

  @Cron('* * * * *', { name: 'caisse-auto-close', timeZone: TZ })
  async handleCron(): Promise<void> {
    try {
      // 1) Activé ? (tout sauf false/0/non/off = activé, avec repli activé si absent).
      const enabled = ((await this.parametres.get(K_ENABLED)) ?? 'true').trim().toLowerCase();
      if (['false', '0', 'non', 'off', ''].includes(enabled)) return;

      // 2) Heure/minute configurées (repli 20h00).
      const heure = (((await this.parametres.getNumber(K_HEURE, 20)) % 24) + 24) % 24;
      const minute = (((await this.parametres.getNumber(K_MINUTE, 0)) % 60) + 60) % 60;

      // 3) Ne se déclenche qu'à l'instant exact configuré.
      const now = this.nowInTz();
      if (now.h !== heure || now.m !== minute) return;

      const { closed, failed } = await this.caissesService.autoCloseAll();
      if (closed > 0 || failed > 0) {
        this.logger.log(`Clôture automatique déclenchée : ${closed} clôturée(s), ${failed} échec(s).`);
      }
    } catch (e) {
      this.logger.error(`Clôture automatique échouée : ${(e as Error).message}`);
    }
  }
}
