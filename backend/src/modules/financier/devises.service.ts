import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Devise } from './entities/devise.entity';

@Injectable()
export class DevisesService {
  constructor(
    @InjectRepository(Devise)
    private readonly deviseRepo: Repository<Devise>,
  ) {}

  findAll(): Promise<Devise[]> {
    return this.deviseRepo.find({ where: { estActif: true }, order: { code: 'ASC' } });
  }

  async findOne(id: string): Promise<Devise> {
    const devise = await this.deviseRepo.findOne({ where: { id } });
    if (!devise) throw new NotFoundException(`Devise ${id} introuvable`);
    return devise;
  }
}
