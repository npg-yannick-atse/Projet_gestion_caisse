import { Entity, Column } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { AuditableEntity } from '@common/entities/base.entity';

export type CaisseStatut = 'OUVERTE' | 'FERMEE';

@Entity({ name: 'fin_caisse' })
export class Caisse extends AuditableEntity {
  @ApiProperty()
  @Column({ type: 'nvarchar', length: 50, unique: true })
  code!: string;

  @ApiProperty()
  @Column({ type: 'nvarchar', length: 200 })
  libelle!: string;

  @Column({ name: 'devise_id', type: 'bigint' })
  deviseId!: string;

  @Column({ name: 'caissier_id', type: 'bigint', nullable: true })
  caissierId?: string | null;

  @Column({ name: 'site_id', type: 'bigint', nullable: true })
  siteId?: string | null;

  @ApiProperty({ default: false })
  @Column({ name: 'est_principale', type: 'bit', default: false })
  estPrincipale!: boolean;

  @ApiProperty({ enum: ['OUVERTE', 'FERMEE'] })
  @Column({ type: 'nvarchar', length: 20, default: 'FERMEE' })
  statut!: CaisseStatut;
}
