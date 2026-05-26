import { Entity, Column } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { AuditableEntity } from '@common/entities/base.entity';

@Entity({ name: 'ref_type_bon' })
export class TypeBon extends AuditableEntity {
  @ApiProperty()
  @Column({ type: 'nvarchar', length: 50, unique: true })
  code!: string;

  @ApiProperty()
  @Column({ type: 'nvarchar', length: 200 })
  libelle!: string;

  @ApiProperty({ required: false })
  @Column({ type: 'nvarchar', length: 'MAX', nullable: true })
  description?: string | null;

  @ApiProperty({ default: false })
  @Column({ name: 'requiert_numero_client', type: 'bit', default: false })
  requiertNumeroClient!: boolean;

  @ApiProperty({ default: true })
  @Column({ name: 'requiert_partenaire', type: 'bit', default: true })
  requiertPartenaire!: boolean;

  @ApiProperty({ default: true })
  @Column({ name: 'requiert_bl', type: 'bit', default: true })
  requiertBl!: boolean;

  @ApiProperty({ default: true })
  @Column({ name: 'est_actif', type: 'bit', default: true })
  estActif!: boolean;
}
