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
