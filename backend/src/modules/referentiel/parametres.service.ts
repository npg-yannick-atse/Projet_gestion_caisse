import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Parametre } from './entities/parametre.entity';

@Injectable()
export class ParametresService {
  constructor(
    @InjectRepository(Parametre) private readonly repo: Repository<Parametre>,
  ) {}

  list(): Promise<Parametre[]> {
    return this.repo.find({ order: { cle: 'ASC' } });
  }

  /** Valeur brute d'un paramètre (null si absent). */
  async get(cle: string): Promise<string | null> {
    const p = await this.repo.findOne({ where: { cle } });
    return p?.valeur ?? null;
  }

  /** Valeur numérique d'un paramètre, avec repli si absent/invalide. */
  async getNumber(cle: string, fallback: number): Promise<number> {
    const v = await this.get(cle);
    const n = v === null ? NaN : Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  async set(cle: string, valeur: string, userId?: string): Promise<Parametre> {
    const p = await this.repo.findOne({ where: { cle } });
    if (!p) throw new NotFoundException(`Paramètre ${cle} introuvable`);
    p.valeur = valeur;
    p.updatedById = (userId ?? null) as any;
    return this.repo.save(p);
  }
}
