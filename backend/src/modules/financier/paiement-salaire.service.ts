import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { PaiementSalaire, SourceFonds } from './entities/paiement-salaire.entity';
import { Caisse } from './entities/caisse.entity';
import { Employe } from '@modules/referentiel/entities/employe.entity';
import { LedgerService } from '@modules/transactionnel/ledger.service';
import { AuthorizationService } from '@modules/security/authorization.service';

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
  constructor(
    @InjectRepository(PaiementSalaire)
    private readonly repo: Repository<PaiementSalaire>,
    @InjectRepository(Employe)
    private readonly employeRepo: Repository<Employe>,
    private readonly dataSource: DataSource,
    private readonly ledger: LedgerService,
    private readonly authz: AuthorizationService,
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
    opts: { search?: string; directionId?: string } = {},
  ): Promise<{ periode: string; lignes: LigneSalaire[] }> {
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

    return {
      periode: p,
      lignes: employes.map((e) => {
        const pay = parEmploye.get(String(e.id));
        return {
          employeId: String(e.id),
          matricule: e.matricule,
          nom: e.nom,
          prenoms: (e as any).prenoms ?? null,
          directionId: e.directionId ? String(e.directionId) : null,
          salaire: e.salaire ?? null,
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
        };
      }),
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
    const montant = (input.montant ?? employe.salaire ?? '').toString().trim();
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

      const paiement = manager.getRepository(PaiementSalaire).create({
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
      });
      return manager.getRepository(PaiementSalaire).save(paiement);
    });
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
