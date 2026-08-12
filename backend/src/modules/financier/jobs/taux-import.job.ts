import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TauxApiService } from '../taux-api.service';
import { ParametresService } from '@modules/referentiel/parametres.service';

/** Même fuseau de référence que la clôture automatique (siège NPG Gandour). */
const TZ = process.env.CAISSE_AUTO_CLOSE_TZ || 'Africa/Abidjan';

const K_HEURE = 'TAUX_API_HEURE';

/**
 * Rapatriement quotidien des taux de change.
 *
 * Comme la clôture automatique (migration 0033), le job tourne chaque heure et
 * ne déclenche qu'à l'heure configurée : le réglage se change depuis la page
 * Paramètres, sans redémarrage.
 *
 * DÉSACTIVÉ PAR DÉFAUT (`TAUX_API_ENABLED` = false). L'accès Internet du serveur
 * n'a pas été vérifié — le test du 11/08/2026 a été fait depuis un poste de
 * développement. Tant que personne n'a confirmé que l'hôte du backend joint
 * l'API, l'import se fait à la main depuis l'écran des taux.
 *
 * Une heure ratée (serveur éteint) n'est PAS rattrapée au réveil : le taux
 * précédent reste simplement en vigueur, ce qui est le comportement voulu — un
 * taux un peu vieux vaut mieux qu'un trou.
 */
@Injectable()
export class TauxImportJob {
  private readonly logger = new Logger('TauxImportJob');

  constructor(
    private readonly tauxApi: TauxApiService,
    private readonly parametres: ParametresService,
  ) {}

  private heureCourante(): number {
    const h = new Intl.DateTimeFormat('fr-FR', {
      timeZone: TZ,
      hour: '2-digit',
      hour12: false,
    }).formatToParts(new Date());
    return Number(h.find((p) => p.type === 'hour')?.value ?? '0') % 24;
  }

  @Cron('0 * * * *', { name: 'taux-import', timeZone: TZ })
  async handleCron(): Promise<void> {
    try {
      if (!(await this.tauxApi.estActif())) return;

      const heure = (((await this.parametres.getNumber(K_HEURE, 6)) % 24) + 24) % 24;
      if (this.heureCourante() !== heure) return;

      const rapport = await this.tauxApi.executerImport(null);

      this.logger.log(
        `Taux importés : ${rapport.importes} mis à jour, ${rapport.echecs} en échec ` +
          `(cotation ${rapport.fraicheurApi ?? 'sans date'}).`,
      );
      for (const l of rapport.lignes.filter((x) => x.statut === 'ECHEC')) {
        this.logger.warn(`  ${l.devise} : ${l.detail}`);
      }
    } catch (e: any) {
      // Un import raté ne doit jamais faire tomber le serveur : les taux
      // précédents restent en vigueur.
      this.logger.error(`Import des taux interrompu : ${e?.message ?? e}`);
    }
  }
}
