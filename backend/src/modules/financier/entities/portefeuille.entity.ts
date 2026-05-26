import { Entity, Column } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { AuditableEntity } from '@common/entities/base.entity';

export type ProprietaireType = 'USER' | 'DIRECTION';

@Entity({ name: 'fin_portefeuille' })
export class Portefeuille extends AuditableEntity {
  @ApiProperty()
  @Column({ type: 'uniqueidentifier', generated: 'uuid' })
  uuid!: string;

  @ApiProperty()
  @Column({ type: 'nvarchar', length: 50, unique: true })
  code!: string;

  @ApiProperty()
  @Column({ type: 'nvarchar', length: 200 })
  libelle!: string;

  @Column({ name: 'caisse_source_id', type: 'bigint' })
  caisseSourceId!: string;

  @Column({ name: 'devise_id', type: 'bigint' })
  deviseId!: string;

  @Column({ name: 'site_id', type: 'bigint', nullable: true })
  siteId?: string | null;

  @ApiProperty({ enum: ['USER', 'DIRECTION'] })
  @Column({ name: 'proprietaire_type', type: 'nvarchar', length: 20 })
  proprietaireType!: ProprietaireType;

  @Column({ name: 'proprietaire_id', type: 'bigint' })
  proprietaireId!: string;

  @ApiProperty({ default: 0 })
  @Column({ name: 'solde_initial', type: 'decimal', precision: 19, scale: 4, default: 0 })
  soldeInitial!: string;

  @ApiProperty({ default: true })
  @Column({ name: 'est_actif', type: 'bit', default: true })
  estActif!: boolean;
}
