import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Caisse } from './entities/caisse.entity';
import { Portefeuille } from './entities/portefeuille.entity';
import { SessionCaisseDevise } from './entities/session-caisse-devise.entity';
import { SessionCaisse, TypeCloture } from './entities/session-caisse.entity';
import { CreateCaisseDto } from './dto/create-caisse.dto';
import { UpdateCaisseDto } from './dto/update-caisse.dto';
import { LedgerService } from '@modules/transactionnel/ledger.service';
import { Role } from '@modules/security/entities/role.entity';
import { UserRole } from '@modules/security/entities/user-role.entity';

@Injectable()
export class CaissesService {
  private readonly logger = new Logger('CaissesService');

  constructor(
    @InjectRepository(Caisse)
    private readonly caisseRepo: Repository<Caisse>,
    @InjectRepository(SessionCaisse)
    private readonly sessionRepo: Repository<SessionCaisse>,
    private readonly dataSource: DataSource,
    private readonly ledgerService: LedgerService,
  ) {}

  async create(dto: CreateCaisseDto, userId: string): Promise<Caisse> {
    const existing = await this.caisseRepo.findOne({ where: { code: dto.code } });
    if (existing) {
      throw new ConflictException(`Une caisse avec le code ${dto.code} existe déjà`);
    }
    const caisse = this.caisseRepo.create({
      code: dto.code,
      libelle: dto.libelle,
      deviseId: dto.deviseId as any,
      siteId: dto.siteId ?? null,
      estPrincipale: dto.estPrincipale ?? false,
      statut: 'FERMEE',
      createdById: userId as any,
    });
    return this.caisseRepo.save(caisse);
  }

  async update(id: string, dto: UpdateCaisseDto, userId: string): Promise<Caisse> {
    const caisse = await this.findOne(id);
    if (dto.code && dto.code !== caisse.code) {
      const conflict = await this.caisseRepo.findOne({ where: { code: dto.code } });
      if (conflict) throw new ConflictException(`Une caisse avec le code ${dto.code} existe déjà`);
      caisse.code = dto.code;
    }
    if (dto.libelle !== undefined) caisse.libelle = dto.libelle;
    if (dto.deviseId !== undefined && String(dto.deviseId) !== String(caisse.deviseId)) {
      // La devise de la caisse n'est qu'un DÉFAUT (devise du résumé de session,
      // valeur proposée à l'encaissement, solde mis en avant sur la carte) : les
      // portefeuilles portent la leur, la caisse peut en détenir plusieurs. La
      // changer reste donc anodin — sauf session ouverte, dont le résumé de
      // clôture serait alors libellé dans une autre devise que celle ouverte.
      if (caisse.statut === 'OUVERTE') {
        throw new BadRequestException(
          `Impossible de changer la devise de la caisse ${caisse.code} tant qu'une session est ouverte. Clôturez-la d'abord.`,
        );
      }
      caisse.deviseId = dto.deviseId as any;
    }
    if (dto.siteId !== undefined) caisse.siteId = dto.siteId as any;
    if (dto.estPrincipale !== undefined) caisse.estPrincipale = dto.estPrincipale;
    if (dto.estActif !== undefined) caisse.estActif = dto.estActif;
    caisse.updatedById = userId as any;
    return this.caisseRepo.save(caisse);
  }

  async toggleActif(id: string, estActif: boolean, userId: string): Promise<Caisse> {
    const caisse = await this.findOne(id);
    if (!estActif && caisse.statut === 'OUVERTE') {
      throw new BadRequestException(
        "Impossible de désactiver une caisse ouverte. Clôturez la session d'abord.",
      );
    }
    caisse.estActif = estActif;
    caisse.updatedById = userId as any;
    return this.caisseRepo.save(caisse);
  }

  async softDelete(id: string, userId: string): Promise<void> {
    const caisse = await this.findOne(id);
    if (caisse.statut === 'OUVERTE') {
      throw new BadRequestException('Impossible de supprimer une caisse ouverte. Clôturez-la d\'abord.');
    }
    // Garde-fou : refus si la caisse est encore rattachée à des éléments actifs.
    const m = this.caisseRepo.manager;
    const checks: Array<[string, string]> = [
      ['portefeuille(s) rattaché(s)', `SELECT COUNT(*) n FROM dbo.fin_portefeuille WHERE caisse_source_id=@0 AND est_actif=1`],
      ['session(s) de caisse ouverte(s)', `SELECT COUNT(*) n FROM dbo.fin_session_caisse WHERE caisse_id=@0 AND statut='OUVERTE'`],
      ['transfert(s) en cours', `SELECT COUNT(*) n FROM dbo.fin_demande_transfert WHERE statut IN ('CREE','VALIDE') AND deleted_at IS NULL AND ((source_type='CAISSE' AND source_id=@0) OR (destination_type='CAISSE' AND destination_id=@0))`],
    ];
    const bloquants: string[] = [];
    for (const [label, sql] of checks) {
      const r = await m.query(sql, [id]);
      const n = Number(r?.[0]?.n ?? 0);
      if (n > 0) bloquants.push(`${n} ${label}`);
    }
    if (bloquants.length) {
      throw new ConflictException(
        `Impossible de supprimer cette caisse : encore rattachée à ${bloquants.join(', ')}. Détachez-les d'abord.`,
      );
    }
    caisse.deletedAt = new Date();
    caisse.deletedById = userId as any;
    await this.caisseRepo.save(caisse);
  }

  async findAll(): Promise<Caisse[]> {
    return this.caisseRepo.find({ order: { code: 'ASC' } });
  }

  async findOne(id: string): Promise<Caisse> {
    const caisse = await this.caisseRepo.findOne({ where: { id } });
    if (!caisse) throw new NotFoundException(`Caisse ${id} introuvable`);
    return caisse;
  }

  /**
   * Solde courant de la caisse, dans SA devise déclarée.
   *
   * Une caisse peut recevoir plusieurs devises (encaissement en USD dans une
   * caisse tenue en XOF) : additionner ces montants ne voudrait rien dire. On
   * renvoie donc le solde de la devise de la caisse, et `getSoldesParDevise`
   * expose la ventilation complète.
   */
  async getSolde(id: string): Promise<string> {
    const caisse = await this.findOne(id);
    return this.ledgerService.calculateBalance(id, 'CAISSE', String(caisse.deviseId));
  }

  /**
   * Ventilation du solde de la caisse par devise — l'image fidèle de ce qu'elle
   * contient réellement. La devise déclarée de la caisse apparaît toujours, même
   * à zéro, pour que l'écran ne la fasse pas disparaître.
   */
  async getSoldesParDevise(
    id: string,
  ): Promise<Array<{ deviseId: string; code: string | null; solde: string; principale: boolean }>> {
    const caisse = await this.findOne(id);
    const lignes = await this.ledgerService.calculateBalancesParDevise(id, 'CAISSE');
    const principale = String(caisse.deviseId);
    if (!lignes.some((l) => l.deviseId === principale)) {
      lignes.push({ deviseId: principale, code: null, solde: '0.0000' });
    }
    return lignes
      .map((l) => ({ ...l, principale: l.deviseId === principale }))
      .sort((a, b) => Number(b.principale) - Number(a.principale) || (a.code ?? '').localeCompare(b.code ?? ''));
  }

  /** Évolution du fond de caisse jour par jour (solde cumulé) sur `days` jours. */
  async getSoldeTimeline(id: string, days = 30): Promise<Array<{ date: string; solde: number }>> {
    await this.findOne(id);
    return this.ledgerService.getSoldeTimeline(id, 'CAISSE', days);
  }

  /** Flux entrées / sorties de la caisse jour par jour (crédits vs débits). */
  async getFluxTimeline(id: string, days = 30): Promise<Array<{ date: string; entrees: number; sorties: number }>> {
    await this.findOne(id);
    return this.ledgerService.getFluxTimeline(id, 'CAISSE', days);
  }

  /** Caisses source (caisseSourceId) des portefeuilles fournis — pour le périmètre. */
  async sourceCaisseIds(portefeuilleIds: string[]): Promise<string[]> {
    if (portefeuilleIds.length === 0) return [];
    const rows = await this.dataSource
      .getRepository(Portefeuille)
      .find({ where: { id: In(portefeuilleIds) as any }, select: ['id', 'caisseSourceId'] });
    return [...new Set(rows.map((p) => String(p.caisseSourceId)).filter(Boolean))];
  }

  async getSessions(caisseId: string): Promise<SessionCaisse[]> {
    await this.findOne(caisseId);
    const sessions = await this.sessionRepo.find({
      where: { caisseId: caisseId as any },
      order: { dateOuverture: 'DESC' },
    });
    return this.attacherDevises(sessions);
  }

  async getCurrentSession(caisseId: string): Promise<SessionCaisse | null> {
    await this.findOne(caisseId);
    const session = await this.sessionRepo.findOne({
      where: { caisseId: caisseId as any, statut: 'OUVERTE' },
    });
    if (!session) return null;
    return (await this.attacherDevises([session]))[0];
  }

  /**
   * Rattache à chaque session le détail de ses soldes par devise.
   *
   * Le `soldeCloture` d'une session ne porte que la devise principale de la
   * caisse : sans ce détail, une caisse ayant reçu des dollars et des euros
   * afficherait une clôture muette sur l'essentiel.
   */
  private async attacherDevises(sessions: SessionCaisse[]): Promise<SessionCaisse[]> {
    if (sessions.length === 0) return sessions;
    const rows = await this.dataSource.query(
      `SELECT d.session_id AS sessionId, d.devise_id AS deviseId, dv.code AS code,
              d.solde_ouverture AS soldeOuverture, d.solde_cloture AS soldeCloture
         FROM dbo.fin_session_caisse_devise d
         LEFT JOIN dbo.fin_devise dv ON dv.id = d.devise_id
        WHERE d.session_id IN (${sessions.map((_, i) => `@${i}`).join(',')})
        ORDER BY dv.code`,
      sessions.map((s) => s.id),
    );
    for (const s of sessions) {
      (s as any).devises = rows
        .filter((r: any) => String(r.sessionId) === String(s.id))
        .map((r: any) => ({
          deviseId: String(r.deviseId),
          code: r.code ?? null,
          soldeOuverture: String(r.soldeOuverture),
          soldeCloture: r.soldeCloture === null ? null : String(r.soldeCloture),
        }));
    }
    return sessions;
  }

  /**
   * Ouvre une caisse : crée une session OUVERTE et passe la caisse à OUVERTE.
   * L'index unique partiel UX_fin_session_caisse_ouverte garantit en base
   * qu'une seule session reste ouverte par caisse.
   */
  async open(caisseId: string, userId: string, soldeOuverture = '0'): Promise<SessionCaisse> {
    // Photo des devises présentes AVANT ouverture : c'est le point de départ
    // auquel la clôture sera comparée, devise par devise.
    const ventilation = await this.getSoldesParDevise(caisseId).catch(() => []);

    return this.dataSource.transaction(async (manager) => {
      const caisseRepo = manager.getRepository(Caisse);
      const sessionRepo = manager.getRepository(SessionCaisse);

      const caisse = await caisseRepo.findOne({ where: { id: caisseId } });
      if (!caisse) throw new NotFoundException(`Caisse ${caisseId} introuvable`);
      if (caisse.statut === 'OUVERTE') {
        throw new ConflictException(`La caisse ${caisse.code} est déjà ouverte`);
      }

      const session = await sessionRepo.save(
        sessionRepo.create({
          caisseId: caisseId as any,
          dateOuverture: new Date(),
          soldeOuverture,
          statut: 'OUVERTE',
          createdById: userId as any,
        }),
      );

      // Solde d'ouverture par devise. La devise principale reçoit la valeur
      // saisie par le caissier ; les autres, leur solde réel constaté.
      const detailRepo = manager.getRepository(SessionCaisseDevise);
      for (const v of ventilation) {
        await detailRepo.save(
          detailRepo.create({
            sessionId: session.id as any,
            deviseId: v.deviseId as any,
            soldeOuverture: v.principale ? soldeOuverture : v.solde,
            soldeCloture: null,
          }),
        );
      }

      caisse.statut = 'OUVERTE';
      caisse.updatedById = userId as any;
      await caisseRepo.save(caisse);

      return session;
    });
  }

  /**
   * Clôture manuelle d'une caisse : ferme la session ouverte et passe la caisse à FERMEE.
   * Le solde de clôture par défaut est le solde calculé depuis les écritures.
   */
  async close(
    caisseId: string,
    userId: string,
    soldeCloture?: string,
    typeCloture: TypeCloture = 'MANUEL',
  ): Promise<SessionCaisse> {
    // Ventilation par devise : une caisse peut en détenir plusieurs, et le solde
    // résumé (celui de sa devise) ne raconte alors qu'une partie de l'histoire.
    const ventilation = await this.getSoldesParDevise(caisseId);
    const soldeCalcule = ventilation.find((v) => v.principale)?.solde ?? '0.0000';

    return this.dataSource.transaction(async (manager) => {
      const caisseRepo = manager.getRepository(Caisse);
      const sessionRepo = manager.getRepository(SessionCaisse);

      const caisse = await caisseRepo.findOne({ where: { id: caisseId } });
      if (!caisse) throw new NotFoundException(`Caisse ${caisseId} introuvable`);
      if (caisse.statut !== 'OUVERTE') {
        throw new BadRequestException(`La caisse ${caisse.code} n'est pas ouverte`);
      }

      const session = await sessionRepo.findOne({
        where: { caisseId: caisseId as any, statut: 'OUVERTE' },
      });
      if (!session) {
        throw new BadRequestException(`Aucune session ouverte pour la caisse ${caisse.code}`);
      }

      // Détail par devise : on enregistre CHAQUE devise présente, y compris
      // celles à zéro, pour garder une trace fidèle de ce que contenait la
      // caisse au moment de la fermeture.
      const detailRepo = manager.getRepository(SessionCaisseDevise);
      const detail: Array<{ deviseId: string; code: string | null; soldeOuverture: string; soldeCloture: string }> = [];
      for (const v of ventilation) {
        // Une devise arrivée en cours de session n'a pas de ligne d'ouverture :
        // on la crée alors avec un solde d'ouverture nul, ce qui est exact.
        const ligne =
          (await detailRepo.findOne({
            where: { sessionId: session.id as any, deviseId: v.deviseId as any },
          })) ??
          detailRepo.create({
            sessionId: session.id as any,
            deviseId: v.deviseId as any,
            soldeOuverture: '0.0000',
          });
        ligne.soldeCloture = v.solde;
        await detailRepo.save(ligne);
        detail.push({
          deviseId: v.deviseId,
          code: v.code,
          soldeOuverture: String(ligne.soldeOuverture),
          soldeCloture: v.solde,
        });
      }

      session.dateCloture = new Date();
      session.soldeCloture = soldeCloture ?? soldeCalcule;
      session.clotureParId = userId as any;
      session.typeCloture = typeCloture;
      session.statut = 'FERMEE';
      await sessionRepo.save(session);

      caisse.statut = 'FERMEE';
      caisse.updatedById = userId as any;
      await caisseRepo.save(caisse);

      // Le détail vient d'être écrit : on le renvoie tel quel plutôt que de le
      // relire, la transaction n'étant pas encore validée.
      (session as any).devises = detail;
      return session;
    });
  }

  /**
   * Clôture automatique de toutes les caisses encore ouvertes (job planifié 20h).
   * Chaque caisse est clôturée indépendamment (type AUTO_20H, solde = solde calculé
   * depuis les écritures) au nom de l'utilisateur « système » ; un échec sur une
   * caisse n'interrompt pas les autres. Idempotent : une caisse déjà fermée est ignorée.
   */
  async autoCloseAll(): Promise<{ closed: number; failed: number }> {
    const systemUserId = await this.resolveSystemUserId();
    if (!systemUserId) {
      this.logger.warn(
        'Clôture automatique 20h ignorée : aucun utilisateur administrateur trouvé (acteur système).',
      );
      return { closed: 0, failed: 0 };
    }

    const ouvertes = await this.caisseRepo.find({ where: { statut: 'OUVERTE' } });
    if (ouvertes.length === 0) return { closed: 0, failed: 0 };

    let closed = 0;
    let failed = 0;
    for (const caisse of ouvertes) {
      try {
        await this.close(String(caisse.id), systemUserId, undefined, 'AUTO_20H');
        closed++;
      } catch (e) {
        failed++;
        this.logger.warn(
          `Clôture automatique de la caisse ${caisse.code} échouée : ${(e as Error).message}`,
        );
      }
    }
    this.logger.log(`Clôture automatique 20h : ${closed} caisse(s) clôturée(s), ${failed} échec(s).`);
    return { closed, failed };
  }

  /** Premier utilisateur admin (acteur « système » des clôtures automatiques). */
  private async resolveSystemUserId(): Promise<string | null> {
    const row: { userId?: string } | undefined = await this.dataSource
      .getRepository(UserRole)
      .createQueryBuilder('ur')
      .innerJoin(Role, 'r', 'r.id = ur.role_id')
      .where('r.code IN (:...codes)', { codes: ['SUPER_ADMIN', 'ADMINISTRATEUR'] })
      .select('ur.user_id', 'userId')
      .getRawOne();
    return row?.userId ? String(row.userId) : null;
  }
}
