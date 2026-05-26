import { Entity, Column } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { AuditableEntity } from '@common/entities/base.entity';

@Entity({ name: 'ref_site' })
export class Site extends AuditableEntity {
  @ApiProperty()
  @Column({ type: 'nvarchar', length: 50, unique: true })
  code!: string;

  @ApiProperty()
  @Column({ type: 'nvarchar', length: 200 })
  libelle!: string;

  @ApiProperty({ required: false })
  @Column({ type: 'nvarchar', length: 500, nullable: true })
  adresse?: string | null;

  @ApiProperty({ required: false })
  @Column({ type: 'nvarchar', length: 100, nullable: true })
  ville?: string | null;

  @ApiProperty({ required: false })
  @Column({ type: 'nvarchar', length: 100, nullable: true })
  pays?: string | null;

  @Column({ name: 'direction_id', type: 'bigint', nullable: true })
  directionId?: string | null;

  @ApiProperty({ default: true })
  @Column({ name: 'est_actif', type: 'bit', default: true })
  estActif!: boolean;
}
