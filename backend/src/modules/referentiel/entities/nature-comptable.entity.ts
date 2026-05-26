import { Entity, Column } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { AuditableEntity } from '@common/entities/base.entity';

@Entity({ name: 'ref_nature_comptable' })
export class NatureComptable extends AuditableEntity {
  @ApiProperty()
  @Column({ type: 'nvarchar', length: 200, unique: true })
  libelle!: string;

  @ApiProperty({ required: false })
  @Column({ type: 'nvarchar', length: 'MAX', nullable: true })
  description?: string | null;

  @Column({ name: 'cost_center_id', type: 'bigint', nullable: true })
  costCenterId?: string | null;

  @Column({ name: 'plan_comptable_id', type: 'bigint', nullable: true })
  planComptableId?: string | null;

  @ApiProperty({ required: false })
  @Column({ name: 'code_comptable_sap', type: 'nvarchar', length: 50, nullable: true })
  codeComptableSap?: string | null;

  @ApiProperty({ default: true })
  @Column({ name: 'est_actif', type: 'bit', default: true })
  estActif!: boolean;
}
