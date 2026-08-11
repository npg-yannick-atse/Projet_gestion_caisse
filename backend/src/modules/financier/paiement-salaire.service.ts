import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { PaiementSalaire, SourceFonds } from './entities/paiement-salaire.entity';
import { Caisse } from './entities/caisse.entity';
import { Employe } from '@modules/referentiel/entities/employe.entity';
import { EmployesService } from '@modules/referentiel/employes.service';
import { LedgerService } from '@modules/transactionnel/ledger.service';
import { AuthorizationService } from '@modules/security/authorization.service';
import { PushService } from '@modules/notifications/push.service';
import { Credit } from './entities/credit.entity';
import { CreditRemboursementService } from './credit-remboursement.service';

export interface PayerSalaireInput {
  employeId: string;
  /** Mois payé, au format AAAA-MM. Par défaut, le mois en cours. */
  periode?: string;
  /** Montant versé. Par défaut, le salaire inscrit sur la fiche de l'employé. */
  montant?: string;
  sourceType: SourceFonds;
  sourceId: string;
  deviseId: string;
  commentaire?: string;
  /**
   * Montant que le caissier accepte de prélever quand le salaire ne couvre pas
   * l'échéance. Ignoré si le salaire suffit : l'échéance est alors prélevée en
   * entier.
   */
  montantRetenue?: string;
}

/** Ligne du tableau des salaires : l'employé, son salaire, et son paiement du mois. */
export interface LigneSalaire {
  employeId: string;
  matricule: string;
  nom: string;
  prenoms: string | null;
  directionId: string | null;
  salaire: string | null;
  /** Paiement de la période demandée, s'il existe. */
  paiement: {
    id: string;
    montant: string;
    datePaiement: Date;
    sourceType: SourceFonds;
    sourceId: string;
    statut: string;
  } | null;
  /**
   * Mensualité qui sera retenue sur cette paie, si l'employé a un crédit dont
   * le prélèvement a été autorisé. `null` s'il n'y a rien à retenir.
   *
   * Le caissier doit savoir AVANT de valider ce qu'il remettra réellement en
   * espèces : sans cette information, il annoncerait le salaire entier.
   */
  retenueCredit: {
    creditId: string;
    echeance: number;
    nbMois: number;
    /** Montant attendu, reliquats des mois précédents déjà replanifiés dedans. */
    montant: string;
    deviseId: string;
    /**
     * Vrai si le salaire ne couvre pas l'échéance. Le caissier doit alors
     * indiquer ce qui peut être prélevé ; le reliquat se reporte sur les mois
     * suivants.
     */
    salaireInsuffisant: boolean;
    /** Plafond de la retenue : on ne prélève pas plus que le salaire versé. */
    maxPrelevable: string;
  } | null;
}

/**
 * Paiement des salaires depuis une caisse ou un portefeuille.
 *
 * Écriture générée, miroir du crédit employé :
 *   DÉBIT  la source (CAISSE / PORTEFEUILLE) → l'argent sort
 *   CRÉDIT le compte SALAIRE                 → contrepartie
 */
@Injectable()
export class PaiementSalaireService {
  private readonly logger = new Logger('PaiementSalaireService');

  constructor(
    @InjectRepository(PaiementSalaire)
    private readonly repo: Repository<PaiementSalaire>,
    @InjectRepository(Employe)
    private readonly employeRepo: Repository<Employe>,
    private readonly dataSource: DataSource,
    private readonly ledger: LedgerService,
    private readonly authz: AuthorizationService,
    private readonly remboursements: CreditRemboursementService,
    private readonly push: PushService,
    private readonly employes: EmployesService,
  ) {}

  /** Mois courant au format AAAA-MM. */
  static periodeCourante(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  /**
   * Valide le format AAAA-MM et refuse un mois futur (on ne paie pas d'avance).
   * Une valeur absente OU VIDE retombe sur le mois courant — `??` seul ne suffit
   * pas ici, une query string non renseignée arrivant comme chaîne vide.
   */
  static normaliserPeriode(periode?: string): string {
    const brut = (periode ?? '').trim();
    const p = brut === '' ? PaiementSalaireService.periodeCourante() : brut;
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(p)) {
      throw new BadRequestException('Période attendue au format AAAA-MM (ex. 2026-07).');
    }
    if (p > PaiementSalaireService.periodeCourante()) {
      throw new BadRequestException('Impossible de payer un mois à venir.');
    }
    return p;
  }

  /**
   * Tableau des salaires pour une période : tous les employés actifs, avec leur
   * salaire et, le cas échéant, le paiement déjà enregistré pour ce mois.
   */
  async listerPourPeriode(
    periode: string,
    opts: { search?: string; directionId?: string; statut?: 'PAYE' | 'NON_PAYE' } = {},
  ): Promise<{
    periode: string;
    lignes: LigneSalaire[];
    /** Effectifs par état AVANT filtrage, pour alimenter les onglets. */
    stats: { total: number; payes: number; nonPayes: number };
  }> {
    const p = PaiementSalaireService.normaliserPeriode(periode);

    const qb = this.employeRepo
      .createQueryBuilder('e')
      .where('e.estActif = :a', { a: true });
    if (opts.directionId) qb.andWhere('e.direction_id = :d', { d: opts.directionId });
    if (opts.search && opts.search.trim()) {
      const s = `%${opts.search.trim().replace(/[\\%_[]/g, (c) => `\\${c}`)}%`;
      qb.andWhere(
        '(e.matricule LIKE :s ESCAPE :esc OR e.nom LIKE :s ESCAPE :esc OR e.prenoms LIKE :s ESCAPE :esc)',
        { s, esc: '\\' },
      );
    }
    const employes = await qb.orderBy('e.nom', 'ASC').addOrderBy('e.prenoms', 'ASC').getMany();

    const paiements = await this.repo.find({
      where: { periode: p, statut: 'PAYE' },
    });
    const parEmploye = new Map(paiements.map((x) => [String(x.employeId), x]));

    // Crédits dont le prélèvement est autorisé, pour les employés affichés.
    // Une seule requête : la grille peut compter plusieurs centaines de lignes.
    const ids = employes.map((e) => String(e.id));
    const credits = ids.length
      ? await this.dataSource.getRepository(Credit).find({
          where: { employeId: In(ids) as any, statut: 'EN_COURS', prelevementSalaire: true },
        })
      : [];
    const situations = await this.remboursements.situations(credits.map((c) => String(c.id)));
    const creditParEmploye = new Map(credits.map((c) => [String(c.employeId), c]));

    // Salaire EN VIGUEUR CE MOIS-LÀ, et non le salaire courant : sans ça, une
    // augmentation d'août ferait payer le nouveau montant pour un juillet resté
    // impayé. Repli sur la fiche pour un employé sans historique.
    const salairesDuMois = await this.employes.salairesDuMois(ids, p);

    const toutesLignes: LigneSalaire[] = employes.map((e) => {
        const pay = parEmploye.get(String(e.id));
        const credit = creditParEmploye.get(String(e.id));
        const situation = credit ? situations[String(credit.id)] : undefined;
        const echeance = situation?.prochaineEcheance ?? null;
        // Montant attendu à cette échéance, reliquats déjà replanifiés inclus —
        // et non la mensualité d'origine, qui serait fausse après un mois court.
        const mensualite = credit && echeance !== null ? situation!.mensualite : null;
        // Aucune retenue avant le mois du décaissement.
        const avantDecaissement = credit ? p < String(credit.dateDebut).slice(0, 7) : false;
        // Le salaire de CE mois. Repli sur la fiche pour un employé antérieur à
        // l'historisation et dont la reprise n'aurait rien produit.
        const salaireMois = salairesDuMois.get(String(e.id)) ?? e.salaire ?? null;
        return {
          employeId: String(e.id),
          matricule: e.matricule,
          nom: e.nom,
          prenoms: (e as any).prenoms ?? null,
          directionId: e.directionId ? String(e.directionId) : null,
          salaire: salaireMois,
          paiement: pay
            ? {
                id: String(pay.id),
                montant: pay.montant,
                datePaiement: pay.datePaiement,
                sourceType: pay.sourceType,
                sourceId: String(pay.sourceId),
                statut: pay.statut,
              }
            : null,
          retenueCredit:
            credit && echeance !== null && mensualite && !avantDecaissement
              ? {
                  creditId: String(credit.id),
                  echeance,
                  nbMois: credit.nbMois,
                  montant: mensualite,
                  deviseId: String(credit.deviseId),
                  salaireInsuffisant: Number(salaireMois ?? 0) < Number(mensualite),
                  // Ce que l'employé pourra au mieux verser ce mois-ci.
                  maxPrelevable: salaireMois ?? '0',
                }
              : null,
      };
    });

    // Les compteurs portent sur l'ensemble de la période (recherche et direction
    // déjà appliquées), pas sur la liste filtrée : sinon l'onglet actif afficherait
    // toujours le total, et les autres zéro.
    const payes = toutesLignes.filter((l) => l.paiement !== null).length;
    const stats = { total: toutesLignes.length, payes, nonPayes: toutesLignes.length - payes };

    const lignes =
      opts.statut === 'PAYE'
        ? toutesLignes.filter((l) => l.paiement !== null)
        : opts.statut === 'NON_PAYE'
          ? toutesLignes.filter((l) => l.paiement === null)
          : toutesLignes;

    return { periode: p, lignes, stats };
  }

  /** Mois d'une période 'AAAA-MM', décalé de `n` mois. */
  private static decalerPeriode(periode: string, n: number): string {
    const [a, m] = periode.split('-').map(Number);
    const d = new Date(Date.UTC(a, m - 1 + n, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  /** Profondeur maximale de recherche des arriérés, en mois. */
  static readonly MAX_MOIS_ARRIERES = 24;

  /**
   * Salaires restés impayés sur les mois ANTÉRIEURS à la période demandée.
   *
   * Sert le cas de l'employé absent le jour de la paie : il n'a pas été réglé ce
   * mois-là, et on le paie à son retour. Sans cette vue, il fallait rouvrir chaque
   * mois passé un par un pour retrouver qui restait à payer.
   *
   * Un salaire n'est dû qu'à partir du mois d'ENTRÉE de l'employé dans
   * l'application (`created_at`) : la fiche ne porte pas de date d'embauche, et
   * réclamer des mois antérieurs à sa création serait faux. Les employés importés
   * en masse sont donc dus à partir de leur import — la vue sous-estime plutôt
   * qu'elle ne sur-réclame.
   */
  async listerArrieres(
    periode: string,
    opts: { search?: string; directionId?: string } = {},
  ): Promise<{
    periode: string;
    lignes: Array<{
      employeId: string;
      matricule: string;
      nom: string;
      prenoms: string | null;
      directionId: string | null;
      periode: string;
      salaire: string | null;
    }>;
    stats: { nb: number; employesConcernes: number };
  }> {
    const p = PaiementSalaireService.normaliserPeriode(periode);
    const plancher = PaiementSalaireService.decalerPeriode(p, -PaiementSalaireService.MAX_MOIS_ARRIERES);

    const qb = this.employeRepo.createQueryBuilder('e').where('e.estActif = :a', { a: true });
    if (opts.directionId) qb.andWhere('e.direction_id = :d', { d: opts.directionId });
    if (opts.search && opts.search.trim()) {
      const s = `%${opts.search.trim().replace(/[\\%_[]/g, (c) => `\\${c}`)}%`;
      qb.andWhere(
        '(e.matricule LIKE :s ESCAPE :esc OR e.nom LIKE :s ESCAPE :esc OR e.prenoms LIKE :s ESCAPE :esc)',
        { s, esc: '\\' },
      );
    }
    const employes = await qb.orderBy('e.nom', 'ASC').addOrderBy('e.prenoms', 'ASC').getMany();
    if (employes.length === 0) return { periode: p, lignes: [], stats: { nb: 0, employesConcernes: 0 } };

    // Un seul aller-retour : les paiements déjà faits sur toute la fenêtre.
    const payes = await this.repo.find({
      where: { employeId: In(employes.map((e) => String(e.id))) as any, statut: 'PAYE' },
    });
    const dejaPaye = new Set(payes.map((x) => `${x.employeId}|${x.periode}`));

    const lignes: Array<{
      employeId: string; matricule: string; nom: string; prenoms: string | null;
      directionId: string | null; periode: string; salaire: string | null;
    }> = [];

    // Le salaire varie d'un mois à l'autre : on résout chaque mois séparément,
    // sinon un arriéré de juillet serait chiffré au salaire d'aujourd'hui.
    const moisRencontres = new Set<string>();
    for (const e of employes) {
      const d = new Date(e.createdAt);
      let m = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      if (m < plancher) m = plancher;
      while (m < p) {
        moisRencontres.add(m);
        m = PaiementSalaireService.decalerPeriode(m, 1);
      }
    }
    const salaireParMois = new Map<string, Map<string, string>>();
    for (const m of moisRencontres) {
      salaireParMois.set(m, await this.employes.salairesDuMois(employes.map((e) => String(e.id)), m));
    }

    for (const e of employes) {
      const entree = `${new Date(e.createdAt).getUTCFullYear()}-${String(
        new Date(e.createdAt).getUTCMonth() + 1,
      ).padStart(2, '0')}`;
      // Le mois courant est déjà couvert par la grille : on s'arrête au précédent.
      let mois = entree > plancher ? entree : plancher;
      while (mois < p) {
        if (!dejaPaye.has(`${e.id}|${mois}`)) {
          lignes.push({
            employeId: String(e.id),
            matricule: e.matricule,
            nom: e.nom,
            prenoms: (e as any).prenoms ?? null,
            directionId: e.directionId ? String(e.directionId) : null,
            periode: mois,
            salaire: salaireParMois.get(mois)?.get(String(e.id)) ?? e.salaire ?? null,
          });
        }
        mois = PaiementSalaireService.decalerPeriode(mois, 1);
      }
    }

    // Du plus ancien au plus récent : on règle les arriérés dans l'ordre.
    lignes.sort((a, b) => a.periode.localeCompare(b.periode) || a.nom.localeCompare(b.nom));
    return {
      periode: p,
      lignes,
      stats: { nb: lignes.length, employesConcernes: new Set(lignes.map((l) => l.employeId)).size },
    };
  }

  /** Historique des paiements d'un employé, du plus récent au plus ancien. */
  async historique(employeId: string): Promise<PaiementSalaire[]> {
    return this.repo.find({
      where: { employeId: employeId as any },
      order: { periode: 'DESC', id: 'DESC' },
    });
  }

  /** Refuse une caisse fermée : on ne sort pas d'argent d'une caisse close. */
  private async assertSourceOuverte(sourceType: SourceFonds, sourceId: string): Promise<void> {
    if (sourceType !== 'CAISSE') return;
    const caisse = await this.dataSource.getRepository(Caisse).findOne({ where: { id: sourceId } });
    if (!caisse) throw new NotFoundException(`Caisse ${sourceId} introuvable`);
    if (caisse.statut !== 'OUVERTE') {
      throw new BadRequestException(`La caisse ${caisse.code} est fermée`);
    }
  }

  /**
   * Verse le salaire : crée l'opération, les écritures, et enregistre le paiement.
   * Le tout dans une seule transaction — pas d'argent sorti sans trace comptable.
   */
  async payer(input: PayerSalaireInput, userId: string): Promise<PaiementSalaire> {
    const periode = PaiementSalaireService.normaliserPeriode(input.periode);

    const employe = await this.employeRepo.findOne({ where: { id: input.employeId as any } });
    if (!employe) throw new NotFoundException(`Employé ${input.employeId} introuvable`);
    if (employe.estActif === false) {
      throw new BadRequestException(`L'employé ${employe.matricule} est inactif.`);
    }

    // Montant : celui fourni, sinon le salaire de la fiche.
    // Le salaire du MOIS PAYÉ fait foi, pas celui d'aujourd'hui : régler un
    // juillet impayé après une augmentation d'août doit verser le montant de
    // juillet. Un montant explicite reste prioritaire (régularisation).
    const salaireDuMois = await this.employes.salaireDuMois(String(employe.id), periode);
    const montant = (input.montant ?? salaireDuMois ?? employe.salaire ?? '').toString().trim();
    if (!montant || !(Number(montant) > 0)) {
      throw new BadRequestException(
        `Aucun montant à payer : renseignez le salaire de ${employe.matricule} ou saisissez un montant.`,
      );
    }

    // Un seul paiement par mois (l'index filtré garantit aussi la règle en base,
    // mais on renvoie ici un message clair plutôt qu'une violation d'index).
    const deja = await this.repo.findOne({
      where: { employeId: input.employeId as any, periode, statut: 'PAYE' },
    });
    if (deja) {
      throw new ConflictException(
        `Le salaire de ${employe.matricule} pour ${periode} a déjà été payé le ` +
          `${new Date(deja.datePaiement).toLocaleDateString('fr-FR')}.`,
      );
    }

    // La source doit être dans le périmètre de celui qui paie.
    if (input.sourceType === 'CAISSE') {
      await this.authz.assertCaisseInPerimeter(userId, input.sourceId);
    } else {
      await this.authz.assertPortefeuilleInPerimeter(userId, input.sourceId);
    }
    await this.assertSourceOuverte(input.sourceType, input.sourceId);

    return this.dataSource.transaction(async (manager) => {
      const op = await this.ledger.createOperation(
        {
          typeOperation: 'SALAIRE',
          caisseId: input.sourceType === 'CAISSE' ? input.sourceId : undefined,
          portefeuilleId: input.sourceType === 'PORTEFEUILLE' ? input.sourceId : undefined,
          montant,
          deviseId: input.deviseId,
          userId,
          reference: `Salaire ${periode} — ${employe.matricule}`,
        },
        manager,
      );

      // DÉBIT source (l'argent sort) / CRÉDIT compte de salaire.
      await this.ledger.createPairedEcritures(
        { compteId: input.sourceId, typeCompte: input.sourceType, deviseId: input.deviseId },
        { compteId: input.employeId, typeCompte: 'SALAIRE', deviseId: input.deviseId },
        montant,
        op.transactionUuid,
        manager,
      );

      const paiement = await manager.getRepository(PaiementSalaire).save(
        manager.getRepository(PaiementSalaire).create({
          employeId: input.employeId as any,
          periode,
          montant,
          deviseId: input.deviseId as any,
          sourceType: input.sourceType,
          sourceId: input.sourceId as any,
          transactionUuid: op.transactionUuid,
          datePaiement: new Date(),
          statut: 'PAYE',
          commentaire: input.commentaire ?? null,
          createdById: userId as any,
        }),
      );

      // Retenue de la mensualité de crédit, dans LA MÊME transaction : soit le
      // salaire et la retenue sont enregistrés ensemble, soit rien ne l'est.
      const retenue = await this.retenirMensualite(paiement, montant, input.montantRetenue, userId, manager);
      (paiement as any).retenueCredit = retenue;
      return paiement;
    });
  }

  /**
   * Prélève la mensualité du crédit en cours de l'employé, si le DAF l'a
   * autorisé à l'approbation.
   *
   * Comptablement, deux opérations distinctes cohabitent : le salaire fait
   * sortir son montant entier, le remboursement fait rentrer la mensualité.
   * Elles se compensent sur la caisse, si bien que le caissier ne remet en
   * espèces que la différence — sans qu'on ait à inventer un montant net.
   *
   * Renvoie `null` quand rien n'est retenu, avec le motif : c'est ce que
   * l'écran affiche au caissier.
   */
  private async retenirMensualite(
    paiement: PaiementSalaire,
    montantSalaire: string,
    montantRetenue: string | undefined,
    userId: string,
    manager: EntityManager,
  ): Promise<{
    montant: string;
    echeance: number;
    creditId: string;
    attendu: string;
    partielle: boolean;
  } | null> {
    const credit = await manager.getRepository(Credit).findOne({
      where: {
        employeId: paiement.employeId as any,
        statut: 'EN_COURS',
        prelevementSalaire: true,
      },
    });
    if (!credit) return null;

    // Une retenue ne peut se faire que dans la devise du crédit : prélever des
    // XOF sur une créance libellée en USD reviendrait à additionner des
    // monnaies différentes.
    if (String(credit.deviseId) !== String(paiement.deviseId)) {
      this.logger.warn(
        `Crédit ${credit.id} non prélevé : devise du salaire (${paiement.deviseId}) ` +
          `différente de celle du crédit (${credit.deviseId}).`,
      );
      return null;
    }

    // Le prélèvement ne commence qu'au DÉCAISSEMENT : une paie régularisée pour
    // un mois antérieur ne doit rien retenir, l'employé n'avait pas encore reçu
    // l'argent du crédit.
    const moisDecaissement = String(credit.dateDebut).slice(0, 7);
    if (paiement.periode < moisDecaissement) {
      this.logger.warn(
        `Crédit ${credit.id} non prélevé sur ${paiement.periode} : antérieur au ` +
          `décaissement (${moisDecaissement}).`,
      );
      return null;
    }

    const situation = await this.remboursements.situation(String(credit.id));
    const echeance = situation.prochaineEcheance;
    if (echeance === null) return null;

    // Montant attendu, reliquats des mois précédents déjà replanifiés dedans.
    const attendu = situation.mensualite;

    // Salaire insuffisant : le caissier indique ce qui peut être prélevé. Sans
    // saisie de sa part, on ne retient rien plutôt que de décider à sa place.
    let montant = attendu;
    if (Number(montantSalaire) < Number(attendu)) {
      const propose = (montantRetenue ?? '').toString().trim();
      if (!propose || !(Number(propose) > 0)) {
        this.logger.warn(
          `Crédit ${credit.id} non prélevé sur ${paiement.periode} : salaire ${montantSalaire} ` +
            `inférieur à l'échéance ${attendu} et aucun montant indiqué par le caissier.`,
        );
        return null;
      }
      if (Number(propose) > Number(montantSalaire)) {
        throw new BadRequestException(
          `La retenue (${propose}) ne peut pas dépasser le salaire versé (${montantSalaire}).`,
        );
      }
      if (Number(propose) > Number(situation.restant)) {
        throw new BadRequestException(
          `La retenue (${propose}) dépasse le reste dû (${situation.restant}).`,
        );
      }
      montant = propose;
    }

    await this.remboursements.enregistrerDepuisSalaire(
      credit,
      { echeance, montant, paiementSalaireId: String(paiement.id) },
      userId,
      manager,
    );

    // Notification d'information : le prélèvement a été autorisé une fois pour
    // toutes, l'approbateur n'a rien à valider — il est simplement tenu informé.
    void this.push.notifyRetenueSalaire(credit, paiement, montant, echeance);

    // `partielle` indique à l'écran qu'il faut afficher la ligne en rouge, et
    // que le reliquat a été reporté sur les mois suivants.
    return {
      montant,
      echeance,
      creditId: String(credit.id),
      attendu,
      partielle: Number(montant) < Number(attendu),
    };
  }

  /**
   * Annule un paiement : le marque ANNULE et contrepasse l'écriture par une
   * opération inverse. L'écriture d'origine reste intacte — les écritures sont
   * immuables, on ne réécrit jamais le passé.
   */
  async annuler(id: string, userId: string, motif?: string): Promise<PaiementSalaire> {
    const paiement = await this.repo.findOne({ where: { id: id as any } });
    if (!paiement) throw new NotFoundException(`Paiement ${id} introuvable`);
    if (paiement.statut !== 'PAYE') {
      throw new BadRequestException('Seul un paiement en statut PAYE peut être annulé.');
    }
    await this.assertSourceOuverte(paiement.sourceType, String(paiement.sourceId));

    return this.dataSource.transaction(async (manager) => {
      const op = await this.ledger.createOperation(
        {
          typeOperation: 'SALAIRE',
          caisseId: paiement.sourceType === 'CAISSE' ? String(paiement.sourceId) : undefined,
          portefeuilleId:
            paiement.sourceType === 'PORTEFEUILLE' ? String(paiement.sourceId) : undefined,
          montant: paiement.montant,
          deviseId: String(paiement.deviseId),
          userId,
          reference: `Annulation salaire ${paiement.periode}`,
        },
        manager,
      );

      // Sens inverse du paiement : DÉBIT salaire / CRÉDIT source (l'argent revient).
      await this.ledger.createPairedEcritures(
        { compteId: String(paiement.employeId), typeCompte: 'SALAIRE', deviseId: String(paiement.deviseId) },
        { compteId: String(paiement.sourceId), typeCompte: paiement.sourceType, deviseId: String(paiement.deviseId) },
        paiement.montant,
        op.transactionUuid,
        manager,
      );

      paiement.statut = 'ANNULE';
      paiement.commentaire = motif ?? paiement.commentaire ?? null;
      paiement.updatedById = userId as any;
      return manager.getRepository(PaiementSalaire).save(paiement);
    });
  }
}
