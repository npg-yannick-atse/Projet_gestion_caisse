import { Entity, Column } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { AuditableEntity } from '@common/entities/base.entity';

@Entity({ name: 'ref_cost_center' })
export class CostCenter extends AuditableEntity {
  @ApiProperty()
  @Column({ type: 'nvarchar', length: 50, unique: true })
  code!: string;

  @ApiProperty()
  @Column({ type: 'nvarchar', length: 200 })
  libelle!: string;

  @ApiProperty({ required: false })
  @Column({ name: 'direction_id', type: 'bigint', nullable: true })
  directionId?: string | null;

  @ApiProperty({ required: false })
  @Column({ name: 'budget_annuel', type: 'decimal', precision: 19, scale: 4, nullable: true })
  budgetAnnuel?: string | null;

  @ApiProperty({ default: true })
  @Column({ name: 'est_actif', type: 'bit', default: true })
  estActif!: boolean;
}
