import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { TauxEchange } from './entities/taux-echange.entity';
import { Devise } from './entities/devise.entity';
import { ParametresService } from '@modules/referentiel/parametres.service';
import { AuthorizationService } from '@modules/security/authorization.service';
import { CreateTauxChangeDto } from './dto/taux-change.dto';

/** Comment le taux effectif a été obtenu. Exposé : l'écran doit pouvoir le dire. */
export type VoieConversion = 'IDENTITE' | 'DIRECT' | 'INVERSE' | 'PIVOT';

export interface Conversion {
  montantSource: string;
  deviseSource: string;
  montantConverti: string;
  deviseCible: string;
  /** Taux effectivement appliqué, tous calculs faits (inversion, pivot inclus). */
  taux: string;
  voie: VoieConversion;
  /** Début de validité du taux le plus ANCIEN utilisé (le maillon faible d'un pivot). */
  dateTaux: Date | null;
  /** Âge en jours de ce même maillon. */
  ageJours: number | null;
  perime: boolean;
}

export interface TauxCourant {
  id: string;
  deviseSourceId: string;
  deviseSource: string;
  deviseCibleId: string;
  deviseCible: string;
  taux: string;
  /** Taux du sens opposé, calculé — jamais stocké. */
  tauxInverse: string;
  dateValiditeDebut: Date;
  source: string;
  motif: string | null;
  pariteFixe: boolean;
  ageJours: number;
  perime: boolean;
}

const JOUR_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class TauxChangeService {
  constructor(
    @InjectRepository(TauxEchange) private readonly repo: Repository<TauxEchange>,
    @InjectRepository(Devise) private readonly deviseRepo: Repository<Devise>,
    private readonly dataSource: DataSource,
    private readonly parametres: ParametresService,
    private readonly authz: AuthorizationService,
  ) {}

  /* ======================================================================
     Réglages
     ====================================================================== */

  /**
   * Devise de consolidation (paramètre `DEVISE_REFERENCE`, XOF chez NPG).
   *
   * Repli sur XOF si le paramètre désigne une devise inconnue ou désactivée :
   * un réglage erroné ne doit pas éteindre tous les totaux des tableaux de bord.
   */
  async deviseReference(): Promise<Devise> {
    const code = (await this.parametres.get('DEVISE_REFERENCE')) ?? 'XOF';
    const devise =
      (await this.deviseRepo.findOne({ where: { code } })) ??
      (await this.deviseRepo.findOne({ where: { code: 'XOF' } }));
    if (!devise) {
      throw new NotFoundException(
        `Devise de référence « ${code} » introuvable, et XOF absente du référentiel.`,
      );
    }
    return devise;
  }

  /** Au-delà de ce nombre de jours, un taux est signalé comme périmé à l'écran. */
  private seuilPeremption(): Promise<number> {
    return this.parametres.getNumber('TAUX_ALERTE_JOURS', 30);
  }

  /* ======================================================================
     Lecture
     ====================================================================== */

  /**
   * Le taux applicable à une date : celui dont la période l'englobe.
   *
   * Borne de début INCLUSE, borne de fin EXCLUE — une période fermée le 1er août
   * et la suivante ouverte le 1er août ne se disputent donc pas cette journée.
   * C'est aussi ce qui rend inoffensive une période de longueur nulle (taux saisi
   * puis corrigé le même jour) : elle n'est jamais sélectionnée.
   */
  async tauxA(deviseSourceId: string, deviseCibleId: string, date: Date): Promise<TauxEchange | null> {
    const rows = await this.repo
      .createQueryBuilder('t')
      .where('t.devise_source_id = :src', { src: deviseSourceId })
      .andWhere('t.devise_cible_id = :cib', { cib: deviseCibleId })
      .andWhere('t.date_validite_debut <= :d', { d: date })
      .andWhere('(t.date_validite_fin IS NULL OR t.date_validite_fin > :d)', { d: date })
      .orderBy('t.date_validite_debut', 'DESC')
      .limit(1)
      .getMany();
    return rows[0] ?? null;
  }

  /** Les taux en vigueur aujourd'hui, un par couple, avec leur âge. */
  async listeCourants(): Promise<TauxCourant[]> {
    const [lignes, seuil] = await Promise.all([
      this.repo.find({
        where: { dateValiditeFin: IsNull() },
        relations: { deviseSource: true, deviseCible: true },
        order: { dateValiditeDebut: 'DESC' },
      }),
      this.seuilPeremption(),
    ]);

    const maintenant = Date.now();
    return lignes.map((t) => {
      // Jamais négatif : cf. `ageDe` dans `convertir`.
      const age = Math.max(
        0,
        Math.floor((maintenant - new Date(t.dateValiditeDebut).getTime()) / JOUR_MS),
      );
      return {
        id: t.id,
        deviseSourceId: t.deviseSourceId,
        deviseSource: t.deviseSource?.code ?? t.deviseSourceId,
        deviseCibleId: t.deviseCibleId,
        deviseCible: t.deviseCible?.code ?? t.deviseCibleId,
        taux: t.taux,
        tauxInverse: (1 / parseFloat(t.taux)).toFixed(8),
        dateValiditeDebut: t.dateValiditeDebut,
        source: t.source,
        motif: t.motif ?? null,
        pariteFixe: t.pariteFixe,
        // Une parité fixe ne périme jamais : elle n'est pas cotée, elle est due.
        ageJours: age,
        perime: !t.pariteFixe && age > seuil,
      };
    });
  }

  /** Toutes les périodes d'un couple, de la plus récente à la plus ancienne. */
  historique(deviseSourceId: string, deviseCibleId: string): Promise<TauxEchange[]> {
    return this.repo.find({
      where: { deviseSourceId, deviseCibleId },
      relations: { deviseSource: true, deviseCible: true },
      order: { dateValiditeDebut: 'DESC' },
    });
  }

  /* ======================================================================
     Conversion
     ====================================================================== */

  /**
   * Convertit un montant d'une devise vers une autre, à une date donnée.
   *
   * Trois voies, essayées dans cet ordre :
   *   DIRECT  le couple est tenu tel quel                  → montant × taux
   *   INVERSE seul le couple opposé est tenu               → montant ÷ taux
   *   PIVOT   ni l'un ni l'autre, mais les deux devises     → via la devise de
   *           sont reliées à la devise de référence          référence
   *
   * Le pivot évite d'exiger un taux pour chaque paire : avec n devises, tenir
   * n−1 taux vers la devise de référence suffit à toutes les convertir entre
   * elles. Il est signalé comme tel dans le résultat, car il cumule l'imprécision
   * de ses deux maillons.
   *
   * Le résultat est arrondi aux décimales de la devise d'ARRIVÉE (`nbDecimales`) :
   * convertir vers du XOF, qui n'a pas de décimale, ne doit pas produire de
   * centimes de franc.
   */
  async convertir(
    montant: string,
    deviseSourceId: string,
    deviseCibleId: string,
    date: Date = new Date(),
  ): Promise<Conversion> {
    const [source, cible] = await Promise.all([
      this.deviseRepo.findOne({ where: { id: deviseSourceId } }),
      this.deviseRepo.findOne({ where: { id: deviseCibleId } }),
    ]);
    if (!source) throw new NotFoundException(`Devise ${deviseSourceId} introuvable`);
    if (!cible) throw new NotFoundException(`Devise ${deviseCibleId} introuvable`);

    const valeur = parseFloat(montant);
    if (!Number.isFinite(valeur)) throw new BadRequestException('Montant à convertir invalide.');

    const base = {
      montantSource: montant,
      deviseSource: source.code,
      deviseCible: cible.code,
    };

    // Même devise : aucun taux n'est requis, et surtout aucun n'existe (la base
    // interdit un couple source = cible).
    if (source.id === cible.id) {
      return {
        ...base,
        montantConverti: valeur.toFixed(source.nbDecimales),
        taux: '1',
        voie: 'IDENTITE',
        dateTaux: null,
        ageJours: null,
        perime: false,
      };
    }

    const seuil = await this.seuilPeremption();
    // `Math.max(0, …)` : un taux qui vient d'être posé peut être daté d'une
    // milliseconde APRÈS l'instant de la conversion, et `Math.floor` d'un très
    // petit négatif vaut −1. Un âge négatif n'a aucun sens et s'afficherait
    // tel quel à l'écran.
    const ageDe = (d: Date) =>
      Math.max(0, Math.floor((date.getTime() - new Date(d).getTime()) / JOUR_MS));

    /**
     * Assemble le résultat à partir des MAILLONS employés (un pour un taux
     * direct ou inversé, deux pour un pivot).
     *
     * La fraîcheur se juge sur les seuls maillons COTÉS. Une parité fixe est
     * exclue du calcul : elle date de 2013 sans être pour autant douteuse, et la
     * compter comme « la plus ancienne » faisait passer pour périmée une
     * conversion EUR → USD dont le maillon coté avait été rapatrié le matin
     * même. Constaté à l'essai le 11/08/2026.
     *
     * S'il n'y a que des parités fixes, on retombe sur elles pour afficher une
     * date — informative, jamais alarmante.
     */
    const fin = (
      taux: number,
      voie: VoieConversion,
      maillons: Array<{ date: Date; pariteFixe: boolean }>,
    ): Conversion => {
      const cotes = maillons.filter((m) => !m.pariteFixe);
      const juges = cotes.length > 0 ? cotes : maillons;
      const plusAncien = juges.reduce((a, b) =>
        new Date(a.date).getTime() <= new Date(b.date).getTime() ? a : b,
      );
      return {
        ...base,
        montantConverti: (valeur * taux).toFixed(cible.nbDecimales),
        taux: taux.toFixed(8),
        voie,
        dateTaux: plusAncien.date,
        ageJours: ageDe(plusAncien.date),
        // Une chaîne ne vaut que par son maillon le plus faible : un seul
        // maillon coté périmé suffit à rendre le résultat douteux.
        perime: cotes.some((m) => ageDe(m.date) > seuil),
      };
    };

    const direct = await this.tauxA(source.id, cible.id, date);
    if (direct) {
      return fin(parseFloat(direct.taux), 'DIRECT', [
        { date: direct.dateValiditeDebut, pariteFixe: direct.pariteFixe },
      ]);
    }

    const inverse = await this.tauxA(cible.id, source.id, date);
    if (inverse) {
      return fin(1 / parseFloat(inverse.taux), 'INVERSE', [
        { date: inverse.dateValiditeDebut, pariteFixe: inverse.pariteFixe },
      ]);
    }

    // Pivot. Inutile de l'essayer si l'une des deux EST la devise de référence :
    // ce cas est déjà couvert par direct/inverse, et il n'aboutirait pas.
    const reference = await this.deviseReference();
    if (source.id !== reference.id && cible.id !== reference.id) {
      const [versRef, cibleVersRef] = await Promise.all([
        this.tauxVers(source.id, reference.id, date),
        this.tauxVers(cible.id, reference.id, date),
      ]);
      if (versRef && cibleVersRef) {
        // source → référence → cible, le second maillon pris à l'envers.
        const taux = versRef.taux / cibleVersRef.taux;
        return fin(taux, 'PIVOT', [versRef, cibleVersRef]);
      }
    }

    throw new BadRequestException(
      `Aucun taux de change ${source.code} → ${cible.code} au ${date.toISOString().slice(0, 10)}. ` +
        `Saisissez-le, ou reliez ces deux devises à ${reference.code}.`,
    );
  }

  /**
   * Taux d'une devise VERS une autre, quel que soit le sens dans lequel il est
   * tenu en base. Sert de brique au pivot.
   */
  private async tauxVers(
    deviseId: string,
    versId: string,
    date: Date,
  ): Promise<{ taux: number; date: Date; pariteFixe: boolean } | null> {
    const direct = await this.tauxA(deviseId, versId, date);
    if (direct) {
      return {
        taux: parseFloat(direct.taux),
        date: direct.dateValiditeDebut,
        pariteFixe: direct.pariteFixe,
      };
    }
    const inverse = await this.tauxA(versId, deviseId, date);
    if (inverse) {
      return {
        taux: 1 / parseFloat(inverse.taux),
        date: inverse.dateValiditeDebut,
        pariteFixe: inverse.pariteFixe,
      };
    }
    return null;
  }

  /**
   * Total consolidé d'un lot de montants en devises mêlées.
   *
   * C'est l'appel des tableaux de bord. Une devise non convertible ne fait PAS
   * échouer le total : elle est écartée et listée à part, à charge pour l'écran
   * de le dire. Un total muet vaut mieux qu'un écran en erreur, mais un total
   * amputé qui se présente comme complet serait pire que les deux.
   */
  async consolider(
    lignes: Array<{ montant: string; deviseId: string }>,
    date: Date = new Date(),
  ): Promise<{
    total: string;
    devise: string;
    converties: number;
    ignorees: Array<{ deviseId: string; montant: string; raison: string }>;
    perime: boolean;
  }> {
    const reference = await this.deviseReference();
    const ignorees: Array<{ deviseId: string; montant: string; raison: string }> = [];
    let total = 0;
    let converties = 0;
    let perime = false;

    for (const ligne of lignes) {
      try {
        const c = await this.convertir(ligne.montant, ligne.deviseId, reference.id, date);
        total += parseFloat(c.montantConverti);
        converties += 1;
        if (c.perime) perime = true;
      } catch (e: any) {
        ignorees.push({
          deviseId: ligne.deviseId,
          montant: ligne.montant,
          raison: e?.message ?? 'conversion impossible',
        });
      }
    }

    return {
      total: total.toFixed(reference.nbDecimales),
      devise: reference.code,
      converties,
      ignorees,
      perime,
    };
  }

  /* ======================================================================
     Écriture
     ====================================================================== */

  /**
   * Enregistre un taux. Ne modifie JAMAIS une ligne existante : le taux en
   * vigueur est CLÔTURÉ à la date de début du nouveau, puis le nouveau est
   * inséré. Même modèle que l'historique des salaires (migration 0053).
   *
   * Un seul sens est tenu par couple : si l'opposé est déjà suivi, la demande est
   * refusée plutôt que d'accepter deux lignes qui se contrediront (1/655,957 n'a
   * pas d'écriture décimale exacte, les deux sens finiraient par diverger).
   */
  async enregistrer(dto: CreateTauxChangeDto, userId: string): Promise<TauxEchange> {
    await this.authz.assertPermission(userId, 'TAUX_GERER', 'gérer les taux de change');
    return this.ecrirePeriode(dto, userId);
  }

  /**
   * Le geste d'écriture lui-même, SANS contrôle d'autorisation — l'appelant en
   * répond. Existe pour l'import automatique, qui tourne sans utilisateur et ne
   * peut donc pas se voir opposer une permission : `userId` y vaut `null`.
   *
   * Toute voie ouverte à un humain doit passer par `enregistrer`.
   */
  async ecrirePeriode(dto: CreateTauxChangeDto, userId: string | null): Promise<TauxEchange> {
    if (dto.deviseSourceId === dto.deviseCibleId) {
      throw new BadRequestException('Les deux devises doivent être différentes.');
    }

    const [source, cible] = await Promise.all([
      this.deviseRepo.findOne({ where: { id: dto.deviseSourceId } }),
      this.deviseRepo.findOne({ where: { id: dto.deviseCibleId } }),
    ]);
    if (!source) throw new NotFoundException(`Devise ${dto.deviseSourceId} introuvable`);
    if (!cible) throw new NotFoundException(`Devise ${dto.deviseCibleId} introuvable`);

    const debut = dto.dateValiditeDebut ? new Date(dto.dateValiditeDebut) : new Date();
    if (Number.isNaN(debut.getTime())) {
      throw new BadRequestException('Date de début de validité invalide.');
    }

    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(TauxEchange);

      const oppose = await repo.findOne({
        where: {
          deviseSourceId: cible.id,
          deviseCibleId: source.id,
          dateValiditeFin: IsNull(),
        },
      });
      if (oppose) {
        throw new ConflictException(
          `Le couple ${cible.code} → ${source.code} est déjà suivi : c'est lui qu'il faut mettre à jour. ` +
            `Le sens ${source.code} → ${cible.code} en est déduit automatiquement.`,
        );
      }

      const courant = await repo.findOne({
        where: {
          deviseSourceId: source.id,
          deviseCibleId: cible.id,
          dateValiditeFin: IsNull(),
        },
      });

      const provenance = dto.source ?? 'MANUEL';

      if (courant) {
        // Une parité fixe n'est pas une cotation : aucun import ne l'écrase.
        // Seule une décision humaine peut la changer — un accord monétaire se
        // renégocie, il ne fluctue pas.
        if (courant.pariteFixe && provenance !== 'MANUEL') {
          throw new ConflictException(
            `${source.code} → ${cible.code} est une parité fixe : elle ne s'importe pas. ` +
              `Sa valeur ne peut être changée qu'à la main.`,
          );
        }
        if (debut.getTime() < new Date(courant.dateValiditeDebut).getTime()) {
          throw new BadRequestException(
            `Le taux ${source.code} → ${cible.code} en vigueur a pris effet le ` +
              `${new Date(courant.dateValiditeDebut).toISOString().slice(0, 10)} : ` +
              `un nouveau taux ne peut pas commencer avant lui.`,
          );
        }
        courant.dateValiditeFin = debut;
        courant.updatedById = userId as any;
        await repo.save(courant);
      }

      const nouveau = repo.create({
        deviseSourceId: source.id,
        deviseCibleId: cible.id,
        taux: dto.taux,
        dateValiditeDebut: debut,
        dateValiditeFin: null,
        source: provenance,
        motif: dto.motif ?? null,
        // Le caractère « parité fixe » appartient au COUPLE, pas à la période :
        // il se transmet d'une période à l'autre, sauf décision explicite.
        pariteFixe: dto.pariteFixe ?? courant?.pariteFixe ?? false,
        createdById: userId as any,
      });
      return repo.save(nouveau);
    });
  }

  /**
   * Retire un taux et REND SA PLACE au précédent (sa date de fin repasse à
   * NULL). Sans cette réouverture, supprimer le taux courant laisserait le couple
   * sans aucun taux en vigueur alors qu'un taux antérieur existe — et les écrans
   * cesseraient de convertir sans que personne ait voulu ça.
   */
  async supprimer(id: string, userId: string): Promise<void> {
    await this.authz.assertPermission(userId, 'TAUX_GERER', 'gérer les taux de change');

    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(TauxEchange);
      const taux = await repo.findOne({ where: { id } });
      if (!taux) throw new NotFoundException(`Taux ${id} introuvable`);

      taux.deletedById = userId as any;
      await repo.save(taux);
      await repo.softDelete(id);

      // Le précédent = la période qui se terminait là où celle-ci commençait.
      const precedent = await repo
        .createQueryBuilder('t')
        .where('t.devise_source_id = :src', { src: taux.deviseSourceId })
        .andWhere('t.devise_cible_id = :cib', { cib: taux.deviseCibleId })
        .andWhere('t.id <> :id', { id })
        .andWhere('t.date_validite_debut <= :debut', { debut: taux.dateValiditeDebut })
        .orderBy('t.date_validite_debut', 'DESC')
        .limit(1)
        .getOne();

      if (precedent && taux.dateValiditeFin === null) {
        precedent.dateValiditeFin = null;
        precedent.updatedById = userId as any;
        await repo.save(precedent);
      }
    });
  }
}
