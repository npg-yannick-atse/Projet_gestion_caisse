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

  async findAll(): Promise<Direction[]> {
    return this.directionRepo.find({
      where: { estActif: true },
      order: { libelle: 'ASC' },
    });
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
    direction.estActif = false;
    await this.directionRepo.save(direction);
  }
}
