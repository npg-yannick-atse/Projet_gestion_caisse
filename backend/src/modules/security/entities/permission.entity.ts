import { Entity, Column } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { AuditableEntity } from '@common/entities/base.entity';

@Entity({ name: 'sec_permission' })
export class Permission extends AuditableEntity {
  @ApiProperty()
  @Column({ type: 'nvarchar', length: 100, unique: true })
  code!: string;

  @ApiProperty()
  @Column({ type: 'nvarchar', length: 200 })
  libelle!: string;

  @ApiProperty()
  @Column({ type: 'nvarchar', length: 50 })
  module!: string;

  @ApiProperty({ required: false })
  @Column({ type: 'nvarchar', length: 'MAX', nullable: true })
  description?: string | null;

  @ApiProperty({ default: true })
  @Column({ name: 'est_actif', type: 'bit', default: true })
  estActif!: boolean;
}
