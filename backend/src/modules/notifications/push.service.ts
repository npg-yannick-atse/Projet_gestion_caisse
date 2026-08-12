import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { PushToken } from './entities/push-token.entity';

interface ExpoMessage {
  to: string;
  sound: 'default';
  title: string;
  body: string;
  data?: Record<string, unknown>;
  channelId?: string;
  priority?: 'default' | 'normal' | 'high';
}

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(
    @InjectRepository(PushToken)
    private readonly tokenRepo: Repository<PushToken>,
    private readonly dataSource: DataSource,
  ) {}

  /** Enregistre / met à jour le jeton push d'un appareil. */
  async registerToken(userId: string, token: string, platform?: string): Promise<void> {
    const existing = await this.tokenRepo.findOne({ where: { token } });
    if (existing) {
      existing.userId = userId as any;
      existing.platform = platform ?? existing.platform ?? null;
      existing.updatedAt = new Date();
      await this.tokenRepo.save(existing);
      return;
    }
    await this.tokenRepo.save(
      this.tokenRepo.create({ userId: userId as any, token, platform: platform ?? null }),
    );
  }

  async removeToken(token: string): Promise<void> {
    await this.tokenRepo.delete({ token });
  }

  /**
   * Notifie (push) les VALIDATEURS de la direction du demandeur qu'un bon est à valider.
   * Best-effort : ne lève jamais (ne doit pas bloquer la création du bon).
   */
  async notifyValidateursNewBon(
    demandeurId: string,
    bon: { id: string; numero: string; montantTotal: string },
  ): Promise<void> {
    try {
      const rows: Array<{ token: string }> = await this.dataSource
        .createQueryBuilder()
        .select('DISTINCT t.token', 'token')
        .from('sec_push_token', 't')
        .innerJoin('sec_user', 'u', 'u.id = t.user_id')
        .innerJoin('sec_user_role', 'ur', 'ur.user_id = u.id')
        .innerJoin('sec_role', 'r', 'r.id = ur.role_id')
        .where('r.code = :code', { code: 'VALIDATEUR' })
        .andWhere('u.id != :dem', { dem: demandeurId })
        .andWhere('u.est_actif = 1')
        .andWhere('u.direction_id = (SELECT direction_id FROM sec_user WHERE id = :dem)', {
          dem: demandeurId,
        })
        .getRawMany();

      const tokens = rows.map((r) => r.token).filter(Boolean);
      if (tokens.length === 0) return;

      const montant = Number(bon.montantTotal || 0).toLocaleString('fr-FR');
      await this.sendExpoPush(tokens, 'Nouveau bon à valider', `${bon.numero} · ${montant}`, {
        bonId: String(bon.id),
      });
    } catch (e) {
      this.logger.warn(`notifyValidateursNewBon échec : ${(e as Error).message}`);
    }
  }

  /**
   * Informe l'approbateur qu'une mensualité vient d'être retenue sur un salaire.
   *
   * Purement informatif : le prélèvement a été autorisé une fois pour toutes à
   * l'approbation du crédit, il n'y a rien à valider. La notification sert à ce
   * que le DAF sache que la retenue a bien eu lieu, sans consulter l'écran.
   *
   * Ne jette jamais : un échec d'envoi ne doit pas faire échouer une paie déjà
   * enregistrée.
   */
  async notifyRetenueSalaire(
    credit: { id: string; prelevementAutoriseParId?: string | null; validateurId?: string | null },
    paiement: { periode: string; employeId: string },
    montant: string,
    echeance: number,
  ): Promise<void> {
    try {
      // Celui qui a autorisé le prélèvement ; à défaut, celui qui a approuvé le crédit.
      const destinataireId = credit.prelevementAutoriseParId ?? credit.validateurId;
      if (!destinataireId) return;

      const rows: Array<{ token: string }> = await this.dataSource
        .createQueryBuilder()
        .select('DISTINCT t.token', 'token')
        .from('sec_push_token', 't')
        .innerJoin('sec_user', 'u', 'u.id = t.user_id')
        .where('u.id = :uid', { uid: destinataireId })
        .andWhere('u.est_actif = 1')
        .getRawMany();

      const tokens = rows.map((r) => r.token).filter(Boolean);
      if (tokens.length === 0) return;

      const [employe] = await this.dataSource.query(
        `SELECT matricule, nom FROM dbo.ref_employe WHERE id = @0`,
        [paiement.employeId],
      );
      const qui = employe ? `${employe.nom} (${employe.matricule})` : `employé ${paiement.employeId}`;

      await this.sendExpoPush(
        tokens,
        'Mensualité retenue sur salaire',
        `${qui} · échéance ${echeance} · ${Number(montant).toLocaleString('fr-FR')}`,
        { creditId: String(credit.id), periode: paiement.periode },
      );
    } catch (e) {
      this.logger.warn(`notifyRetenueSalaire échec : ${(e as Error).message}`);
    }
  }

  /**
   * Rappelle au demandeur qu'un de ses bons récurrents arrive à échéance.
   *
   * Le destinataire est le DEMANDEUR et lui seul : c'est lui qui décide de
   * relancer la dépense, pas le validateur, qui n'a rien à traiter tant que
   * rien n'est soumis.
   *
   * Ne lève jamais : le job traite plusieurs bons à la suite, l'échec d'un
   * envoi ne doit pas priver les autres de leur rappel.
   */
  async notifyEcheanceRecurrence(
    demandeurId: string,
    bon: { id: string; numero: string; montantTotal: string },
  ): Promise<void> {
    try {
      const rows: Array<{ token: string }> = await this.dataSource
        .createQueryBuilder()
        .select('DISTINCT t.token', 'token')
        .from('sec_push_token', 't')
        .innerJoin('sec_user', 'u', 'u.id = t.user_id')
        .where('u.id = :uid', { uid: demandeurId })
        .andWhere('u.est_actif = 1')
        .getRawMany();

      const tokens = rows.map((r) => r.token).filter(Boolean);
      if (tokens.length === 0) return;

      const montant = Number(bon.montantTotal || 0).toLocaleString('fr-FR');
      await this.sendExpoPush(
        tokens,
        'Bon récurrent à renouveler',
        `${bon.numero} · ${montant}`,
        { bonId: String(bon.id) },
      );
    } catch (e) {
      this.logger.warn(`notifyEcheanceRecurrence échec : ${(e as Error).message}`);
    }
  }

  /**
   * Informe le VALIDATEUR qu'un bon qu'il a signé vient d'être décaissé.
   *
   * Il avait engagé l'argent sans jamais savoir s'il était sorti : le bon
   * quittait sa file au moment de la validation et plus rien ne lui revenait.
   * Cette notification ferme la boucle.
   *
   * Destinataires : ceux qui ont RÉELLEMENT statué sur ce bon, lus dans le
   * journal des décisions — pas « les validateurs » en bloc, qui recevraient
   * des nouvelles de dossiers qu'ils n'ont jamais vus. Le caissier qui vient de
   * décaisser en est exclu : il sait ce qu'il a fait.
   *
   * Ne lève jamais : l'argent est déjà sorti et l'écriture est passée, un échec
   * d'envoi ne doit pas remonter en erreur.
   */
  async notifyValidateursDecaissement(
    bonId: string,
    caissierId: string,
    infos: { numero: string; montant: string; beneficiaire?: string | null },
  ): Promise<void> {
    try {
      const rows: Array<{ token: string }> = await this.dataSource
        .createQueryBuilder()
        .select('DISTINCT t.token', 'token')
        .from('sec_push_token', 't')
        .innerJoin('sec_user', 'u', 'u.id = t.user_id')
        .innerJoin('trx_validation_bon', 'v', 'v.validateur_id = u.id')
        .where('v.bon_id = :bonId', { bonId })
        .andWhere("v.action IN ('VALIDE', 'SIGNE')")
        .andWhere('u.id != :caissier', { caissier: caissierId })
        .andWhere('u.est_actif = 1')
        .getRawMany();

      const tokens = rows.map((r) => r.token).filter(Boolean);
      if (tokens.length === 0) return;

      const montant = Number(infos.montant || 0).toLocaleString('fr-FR');
      await this.sendExpoPush(
        tokens,
        'Bon décaissé',
        `${infos.numero} · ${montant}${infos.beneficiaire ? ` · remis à ${infos.beneficiaire}` : ''}`,
        { bonId: String(bonId) },
      );
    } catch (e) {
      this.logger.warn(`notifyValidateursDecaissement échec : ${(e as Error).message}`);
    }
  }

  /** Envoie une notification via l'API Expo Push. */
  private async sendExpoPush(
    tokens: string[],
    title: string,
    body: string,
    data?: Record<string, unknown>,
  ): Promise<void> {
    const messages: ExpoMessage[] = tokens.map((to) => ({
      to,
      sound: 'default',
      title,
      body,
      data,
      channelId: 'default',
      priority: 'high',
    }));

    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages),
    });
    if (!res.ok) {
      this.logger.warn(`Expo push HTTP ${res.status}`);
    }
  }
}
