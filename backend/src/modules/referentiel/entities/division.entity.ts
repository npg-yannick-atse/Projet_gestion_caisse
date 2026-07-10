import { Entity, Column } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { AuditableEntity } from '@common/entities/base.entity';

/** Division (région/zone) d'un pays. Un pays a 0..N divisions. */
@Entity({ name: 'ref_division' })
export class Division extends AuditableEntity {
  @ApiProperty()
  @Column({ type: 'nvarchar', length: 20 })
  code!: string;

  @ApiProperty()
  @Column({ type: 'nvarchar', length: 150 })
  libelle!: string;

  @ApiProperty()
  @Column({ name: 'pays_id', type: 'bigint' })
  paysId!: string;

  @ApiProperty({ default: true })
  @Column({ name: 'est_actif', type: 'bit', default: true })
  estActif!: boolean;
}
