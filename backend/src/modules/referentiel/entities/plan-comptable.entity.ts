import { Entity, Column } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { AuditableEntity } from '@common/entities/base.entity';

@Entity({ name: 'ref_plan_comptable' })
export class PlanComptable extends AuditableEntity {
  @ApiProperty()
  @Column({ name: 'numero_compte', type: 'nvarchar', length: 50, unique: true })
  numeroCompte!: string;

  @ApiProperty()
  @Column({ type: 'nvarchar', length: 200 })
  libelle!: string;

  @ApiProperty()
  @Column({ name: 'type_compte', type: 'nvarchar', length: 20 })
  typeCompte!: string;

  @ApiProperty({ required: false })
  @Column({ name: 'parent_id', type: 'bigint', nullable: true })
  parentId?: string | null;

  @ApiProperty({ default: true })
  @Column({ name: 'est_actif', type: 'bit', default: true })
  estActif!: boolean;
}
