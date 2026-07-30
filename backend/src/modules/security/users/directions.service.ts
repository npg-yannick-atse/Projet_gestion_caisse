import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Direction } from '../entities/direction.entity';
import { CreateDirectionDto, UpdateDirectionDto } from './dto/direction.dto';

@Injectable()
export class DirectionsService {
  constructor(
    @InjectRepository(Direction)
    private readonly directionRepo: Repository<Direction>,
  ) {}

  async create(dto: CreateDirectionDto): Promise<Direction> {
    const existing = await this.directionRepo.findOne({ where: { code: dto.code } });
    if (existing) {
      throw new ConflictException(`Direction avec le code ${dto.code} existe déjà`);
    }

    const direction = this.directionRepo.create(dto);
    return this.directionRepo.save(direction);
  }

  async findAll(opts: { search?: string; sortBy?: string; sortDir?: 'asc' | 'desc' } = {}): Promise<Direction[]> {
    const qb = this.directionRepo.createQueryBuilder('d').where('d.estActif = :a', { a: true });
    if (opts.search && opts.search.trim()) {
      const s = `%${opts.search.trim().replace(/[\\%_[]/g, (c) => `\\${c}`)}%`;
      qb.andWhere('(d.code LIKE :s ESCAPE :e OR d.libelle LIKE :s ESCAPE :e)', { s, e: '\\' });
    }
    const map: Record<string, string> = { code: 'code', libelle: 'libelle' };
    const col = map[opts.sortBy ?? ''];
    const dir: 'ASC' | 'DESC' = opts.sortDir === 'desc' ? 'DESC' : 'ASC';
    qb.orderBy(col ? `d.${col}` : 'd.libelle', col ? dir : 'ASC');
    return qb.getMany();
  }

  async findOne(id: string): Promise<Direction> {
    const direction = await this.directionRepo.findOne({ where: { id } });
    if (!direction) throw new NotFoundException(`Direction ${id} introuvable`);
    return direction;
  }

  async update(id: string, dto: UpdateDirectionDto): Promise<Direction> {
    const direction = await this.findOne(id);
    
    if (dto.code && dto.code !== direction.code) {
      const existing = await this.directionRepo.findOne({ where: { code: dto.code } });
      if (existing) {
        throw new ConflictException(`Direction avec le code ${dto.code} existe déjà`);
      }
    }

    Object.assign(direction, dto);
    return this.directionRepo.save(direction);
  }

  async remove(id: string): Promise<void> {
    const direction = await this.findOne(id);
    // Garde-fou : on refuse de désactiver une direction encore rattachée à des
    // éléments actifs (portefeuille, centre de coût, employés, sites, utilisateurs).
    const m = this.directionRepo.manager;
    const checks: Array<[string, string]> = [
      ['portefeuille(s)', `SELECT COUNT(*) n FROM dbo.fin_portefeuille WHERE proprietaire_type='DIRECTION' AND proprietaire_id=@0 AND est_actif=1`],
      ['centre(s) de coût', `SELECT COUNT(*) n FROM dbo.ref_cost_center WHERE direction_id=@0 AND est_actif=1`],
      ['employé(s)', `SELECT COUNT(*) n FROM dbo.ref_employe WHERE direction_id=@0 AND est_actif=1`],
      ['site(s)', `SELECT COUNT(*) n FROM dbo.ref_site WHERE direction_id=@0 AND est_actif=1`],
      ['utilisateur(s)', `SELECT COUNT(*) n FROM dbo.sec_user WHERE direction_id=@0 AND est_actif=1`],
    ];
    const bloquants: string[] = [];
    for (const [label, sql] of checks) {
      const r = await m.query(sql, [id]);
      const n = Number(r?.[0]?.n ?? 0);
      if (n > 0) bloquants.push(`${n} ${label}`);
    }
    if (bloquants.length) {
      throw new ConflictException(
        `Impossible de désactiver cette direction : encore rattachée à ${bloquants.join(', ')}. Détachez-les d'abord.`,
      );
    }
    direction.estActif = false;
    await this.directionRepo.save(direction);
  }
}
