import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { TauxEchange } from './entities/taux-echange.entity';
import { Devise } from './entities/devise.entity';
import { ParametresService } from '@modules/referentiel/parametres.service';
import { AuthorizationService } from '@modules/security/authorization.service';
import { TauxChangeService } from './taux-change.service';

/** Clés de configuration, modifiables depuis la page Paramètres. */
const K_ENABLED = 'TAUX_API_ENABLED';
const K_URL = 'TAUX_API_URL';
const K_DEVISES = 'TAUX_API_DEVISES';

/** Au-delà, on considère l'API injoignable plutôt que d'immobiliser une requête. */
const TIMEOUT_MS = 15_000;

export interface LigneImport {
  devise: string;
  statut: 'IMPORTE' | 'INCHANGE' | 'PARITE_FIXE' | 'ECHEC';
  taux?: string;
  ancienTaux?: string;
  /** Variation en % par rapport au taux qui était en vigueur. */
  variation?: string;
  detail?: string;
}

export interface RapportImport {
  deviseReference: string;
  /** Horodatage de mise à jour annoncé par l'API elle-même, pas celui de l'import. */
  fraicheurApi: string | null;
  lignes: LigneImport[];
  importes: number;
  echecs: number;
}

/**
 * Alimentation des taux depuis une API de cotation en ligne.
 *
 * Source par défaut : `open.er-api.com` — gratuite, sans clé, XOF compris, mise
 * à jour quotidienne. L'URL vit en paramètre : en changer ne demande pas de
 * redéploiement.
 *
 * L'import n'écrit RIEN quand le taux n'a pas bougé. Sans cette retenue, chaque
 * passage ouvrirait une période identique à la précédente et l'historique
 * deviendrait illisible — or c'est lui qui permet de reconvertir une opération
 * ancienne à son taux d'époque.
 *
 * Un appel par devise, et non un appel unique sur la devise de référence : le
 * XOF valant ~568 dollars pour un, le cours inverse revient à 0,001761 — six
 * décimales qui, réinversées, donnent 567,86 au lieu de 568,03. Interroger
 * l'API dans le sens où le cours est grand préserve la précision.
 */
@Injectable()
export class TauxApiService {
  private readonly logger = new Logger('TauxApiService');

  constructor(
    @InjectRepository(TauxEchange) private readonly repo: Repository<TauxEchange>,
    @InjectRepository(Devise) private readonly deviseRepo: Repository<Devise>,
    private readonly parametres: ParametresService,
    private readonly tauxChange: TauxChangeService,
    private readonly authz: AuthorizationService,
  ) {}

  /** L'import automatique est-il activé ? (repli : non). */
  async estActif(): Promise<boolean> {
    const v = ((await this.parametres.get(K_ENABLED)) ?? 'false').trim().toLowerCase();
    return !['false', '0', 'non', 'off', ''].includes(v);
  }

  /**
   * Import déclenché par un humain depuis l'écran des taux : mêmes droits que la
   * saisie manuelle, puisque le résultat est le même — un taux qui change.
   */
  async importerManuel(userId: string): Promise<RapportImport> {
    await this.authz.assertPermission(userId, 'TAUX_GERER', 'importer les taux de change');
    return this.executerImport(userId);
  }

  /**
   * Rapatrie les taux des devises configurées vers la devise de référence.
   *
   * SANS contrôle d'autorisation : le job planifié tourne sans utilisateur.
   * `userId` vaut alors `null` et `created_by_id` reste vide — `source = 'API'`
   * dit déjà d'où vient la ligne. Toute voie ouverte à un humain doit passer par
   * `importerManuel`.
   */
  async executerImport(userId: string | null): Promise<RapportImport> {
    const reference = await this.tauxChange.deviseReference();
    const codes = ((await this.parametres.get(K_DEVISES)) ?? 'USD')
      .split(',')
      .map((c) => c.trim().toUpperCase())
      .filter((c) => c.length > 0 && c !== reference.code);

    const rapport: RapportImport = {
      deviseReference: reference.code,
      fraicheurApi: null,
      lignes: [],
      importes: 0,
      echecs: 0,
    };

    if (codes.length === 0) {
      throw new BadRequestException(
        `Aucune devise à importer : le paramètre ${K_DEVISES} est vide ` +
          `(ou ne contient que la devise de référence ${reference.code}).`,
      );
    }

    for (const code of codes) {
      try {
        rapport.lignes.push(await this.importerUne(code, reference, userId, rapport));
      } catch (e: any) {
        this.logger.warn(`Import ${code} → ${reference.code} : ${e?.message ?? e}`);
        rapport.lignes.push({
          devise: code,
          statut: 'ECHEC',
          detail: e?.message ?? 'erreur inconnue',
        });
      }
    }

    rapport.importes = rapport.lignes.filter((l) => l.statut === 'IMPORTE').length;
    rapport.echecs = rapport.lignes.filter((l) => l.statut === 'ECHEC').length;
    return rapport;
  }

  private async importerUne(
    code: string,
    reference: Devise,
    userId: string | null,
    rapport: RapportImport,
  ): Promise<LigneImport> {
    const devise = await this.deviseRepo.findOne({ where: { code } });
    if (!devise) {
      return { devise: code, statut: 'ECHEC', detail: `Devise ${code} absente du référentiel.` };
    }

    // Une parité fixe se reconnaît AVANT l'appel réseau : inutile d'interroger
    // l'API pour un taux qu'on refusera d'écrire.
    const courant = await this.repo.findOne({
      where: {
        deviseSourceId: devise.id,
        deviseCibleId: reference.id,
        dateValiditeFin: IsNull(),
      },
    });
    if (courant?.pariteFixe) {
      return {
        devise: code,
        statut: 'PARITE_FIXE',
        taux: courant.taux,
        detail: 'Parité fixée par accord monétaire : non importée.',
      };
    }

    const cotation = await this.lireApi(code, reference.code);
    if (rapport.fraicheurApi === null) rapport.fraicheurApi = cotation.miseAJour;

    const nouveau = cotation.taux;
    const ancien = courant ? parseFloat(courant.taux) : null;

    // Inchangé : on ne crée pas une période jumelle de la précédente.
    if (ancien !== null && Math.abs(nouveau - ancien) < 1e-8) {
      return {
        devise: code,
        statut: 'INCHANGE',
        taux: courant!.taux,
        ancienTaux: courant!.taux,
        variation: '0.00',
      };
    }

    const variation = ancien !== null && ancien !== 0 ? ((nouveau - ancien) / ancien) * 100 : null;

    await this.tauxChange.ecrirePeriode(
      {
        deviseSourceId: devise.id,
        deviseCibleId: reference.id,
        taux: nouveau.toFixed(8),
        source: 'API',
        motif: `Import automatique — cotation du ${cotation.miseAJour ?? 'jour'}`,
      },
      userId,
    );

    return {
      devise: code,
      statut: 'IMPORTE',
      taux: nouveau.toFixed(8),
      ancienTaux: courant?.taux,
      variation: variation === null ? undefined : variation.toFixed(2),
    };
  }

  /**
   * Interroge l'API pour un couple, et n'accepte la réponse que si elle porte
   * un cours strictement positif. Un zéro, un `null` ou un texte sont refusés :
   * la table `TCURR` de SAP contenait justement des cours à zéro, et un taux nul
   * empoisonnerait toutes les conversions qui s'y appuieraient ensuite.
   */
  private async lireApi(
    base: string,
    cible: string,
  ): Promise<{ taux: number; miseAJour: string | null }> {
    const gabarit =
      (await this.parametres.get(K_URL)) ?? 'https://open.er-api.com/v6/latest/{BASE}';
    const url = gabarit.replace('{BASE}', encodeURIComponent(base));

    let reponse: Response;
    try {
      reponse = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (e: any) {
      const cause = e?.name === 'TimeoutError' ? `pas de réponse en ${TIMEOUT_MS / 1000} s` : e?.message;
      throw new Error(
        `API de taux injoignable (${cause}). Vérifiez que le serveur accède à Internet.`,
      );
    }

    if (!reponse.ok) {
      throw new Error(`API de taux : réponse HTTP ${reponse.status}.`);
    }

    const corps: any = await reponse.json();
    const taux = Number(corps?.rates?.[cible]);
    if (!Number.isFinite(taux) || taux <= 0) {
      throw new Error(`L'API ne cote pas ${base} → ${cible} (ou renvoie une valeur inexploitable).`);
    }

    return {
      taux,
      miseAJour: corps?.time_last_update_utc ?? corps?.date ?? null,
    };
  }
}
