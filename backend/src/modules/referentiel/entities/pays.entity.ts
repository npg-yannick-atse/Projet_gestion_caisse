import { Entity, Column } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { AuditableEntity } from '@common/entities/base.entity';

@Entity({ name: 'ref_pays' })
export class Pays extends AuditableEntity {
  @ApiProperty()
  @Column({ type: 'nvarchar', length: 10, unique: true })
  code!: string;

  @ApiProperty()
  @Column({ type: 'nvarchar', length: 150 })
  libelle!: string;

  @ApiProperty({ default: true })
  @Column({ name: 'est_actif', type: 'bit', default: true })
  estActif!: boolean;
}
