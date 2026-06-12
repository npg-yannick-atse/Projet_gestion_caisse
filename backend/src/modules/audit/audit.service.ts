import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JournalAudit } from './entities/journal.entity';

export interface AuditEntryInput {
  userId?: string | null;
  action: string;
  entiteConcernee: string;
  entiteId?: string | null;
  ancienneValeur?: string | null;
  nouvelleValeur?: string | null;
  adresseIp?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(JournalAudit)
    private readonly journalRepo: Repository<JournalAudit>,
  ) {}

  /** Écrit une entrée d'audit. Tolérant aux pannes : ne casse jamais la requête appelante. */
  async record(entry: AuditEntryInput): Promise<void> {
    try {
      await this.journalRepo.insert({
        userId: entry.userId ?? null,
        action: entry.action.slice(0, 100),
        entiteConcernee: (entry.entiteConcernee || '—').slice(0, 100),
        entiteId: entry.entiteId ?? null,
        ancienneValeur: entry.ancienneValeur ?? null,
        nouvelleValeur: entry.nouvelleValeur ?? null,
        adresseIp: entry.adresseIp ? entry.adresseIp.slice(0, 45) : null,
        userAgent: entry.userAgent ? entry.userAgent.slice(0, 500) : null,
      });
    } catch (e) {
      console.warn('[audit] enregistrement échoué :', (e as Error).message);
    }
  }

  /** Journal d'audit filtrable (append-only) — réservé au Super Admin via le contrôleur. */
  async findAll(opts: {
    userId?: string;
    action?: string;
    entite?: string;
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
  } = {}): Promise<JournalAudit[]> {
    const qb = this.journalRepo.createQueryBuilder('j').where('1=1');
    if (opts.userId) qb.andWhere('j.user_id = :uid', { uid: opts.userId });
    if (opts.action) qb.andWhere('j.action LIKE :a', { a: `%${opts.action}%` });
    if (opts.entite) qb.andWhere('j.entite_concernee LIKE :e', { e: `%${opts.entite}%` });
    if (opts.dateFrom) qb.andWhere('j.date_action >= :df', { df: new Date(opts.dateFrom) });
    if (opts.dateTo) {
      const dt = new Date(opts.dateTo);
      dt.setHours(23, 59, 59, 999);
      qb.andWhere('j.date_action <= :dt', { dt });
    }
    return qb
      .orderBy('j.date_action', 'DESC')
      .limit(Math.min(Math.max(opts.limit ?? 500, 1), 2000))
      .getMany();
  }
}
