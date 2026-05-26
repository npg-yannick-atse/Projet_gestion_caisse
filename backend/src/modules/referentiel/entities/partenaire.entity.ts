import { Entity, Column } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { AuditableEntity } from '@common/entities/base.entity';

export type TypePartenaire = 'CLIENT' | 'FOURNISSEUR' | 'MIXTE';

@Entity({ name: 'ref_partenaire' })
export class Partenaire extends AuditableEntity {
  @ApiProperty()
  @Column({ type: 'uniqueidentifier', generated: 'uuid' })
  uuid!: string;

  @ApiProperty()
  @Column({ type: 'nvarchar', length: 50, unique: true })
  code!: string;

  @ApiProperty()
  @Column({ name: 'raison_sociale', type: 'nvarchar', length: 255 })
  raisonSociale!: string;

  @ApiProperty({ required: false })
  @Column({ type: 'nvarchar', length: 50, nullable: true })
  sigle?: string | null;

  @ApiProperty({ enum: ['CLIENT', 'FOURNISSEUR', 'MIXTE'] })
  @Column({ name: 'type_partenaire', type: 'nvarchar', length: 20 })
  typePartenaire!: TypePartenaire;

  @ApiProperty({ required: false })
  @Column({ name: 'numero_client', type: 'nvarchar', length: 50, nullable: true })
  numeroClient?: string | null;

  @ApiProperty({ required: false })
  @Column({ type: 'nvarchar', length: 500, nullable: true })
  adresse?: string | null;

  @ApiProperty({ required: false })
  @Column({ type: 'nvarchar', length: 30, nullable: true })
  telephone?: string | null;

  @ApiProperty({ required: false })
  @Column({ type: 'nvarchar', length: 200, nullable: true })
  email?: string | null;

  @ApiProperty({ required: false })
  @Column({ type: 'nvarchar', length: 100, nullable: true })
  pays?: string | null;

  @ApiProperty({ required: false })
  @Column({ type: 'nvarchar', length: 100, nullable: true })
  ville?: string | null;

  @ApiProperty({ default: true })
  @Column({ name: 'est_actif', type: 'bit', default: true })
  estActif!: boolean;
}
