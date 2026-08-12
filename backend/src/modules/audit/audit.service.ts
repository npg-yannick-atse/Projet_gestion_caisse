import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JournalAudit } from './entities/journal.entity';
import { AuditResumeService, LigneAuditVue } from './audit-resume.service';

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
    private readonly resume: AuditResumeService,
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

  /**
   * Whitelist des colonnes triables côté BD (défaut : date_action DESC).
   * L'utilisateur est affiché en nom côté front mais stocké en id : on ne l'expose
   * pas au tri (tri sur un id n'a pas de sens lisible).
   */
  private static readonly AUDIT_SORT_MAP: Record<string, string> = {
    dateAction: 'j.date_action',
    action: 'j.action',
    entite: 'j.entite_concernee',
  };

  /** Journal d'audit filtrable (append-only) — réservé au Super Admin via le contrôleur. */
  async findAll(opts: {
    userId?: string;
    action?: string;
    entite?: string;
    dateFrom?: string;
    dateTo?: string;
    sortBy?: string;
    sortDir?: 'asc' | 'desc';
    limit?: number;
  } = {}): Promise<LigneAuditVue[]> {
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
    const column = AuditService.AUDIT_SORT_MAP[opts.sortBy ?? ''];
    const direction: 'ASC' | 'DESC' = opts.sortDir === 'asc' ? 'ASC' : 'DESC';
    if (column) qb.orderBy(column, direction);
    else qb.orderBy('j.date_action', 'DESC');
    const lignes = await qb.limit(Math.min(Math.max(opts.limit ?? 500, 1), 2000)).getMany();
    // Chaque ligne reçoit sa lecture en clair ; le JSON d'origine est conservé.
    return this.resume.enrichir(lignes);
  }
}
