import { Entity, Column } from 'typeorm';
import { decimalToString } from '@common/transformers/decimal.transformer';
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

  @ApiProperty({ required: false, description: 'Budget mensuel du centre de coût (DECIMAL(19,4) en string)' })
  @Column({ name: 'budget_mensuel', type: 'decimal', precision: 19, scale: 4, transformer: decimalToString, nullable: true })
  budgetMensuel?: string | null;

  @ApiProperty({ default: true })
  /** Natures d'opération rattachées à ce centre. NON PERSISTÉ : compté à la lecture. */
  nbNatures?: number;

  @Column({ name: 'est_actif', type: 'bit', default: true })
  estActif!: boolean;
}
