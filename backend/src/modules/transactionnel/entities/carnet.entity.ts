import { Entity, Column, Index } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { AuditableEntity } from '@common/entities/base.entity';

export type CarnetStatut = 'ACTIF' | 'EPUISE' | 'CLOTURE';

/**
 * Carnet de bons manuels (papier pré-numéroté) remis à un caissier.
 * Ex. carnet n° 1000 à 1050 rattaché à une caisse.
 */
@Entity({ name: 'trx_carnet' })
@Index('UX_trx_carnet_uuid', ['uuid'], { unique: true })
export class Carnet extends AuditableEntity {
  @ApiProperty()
  @Column({ type: 'uniqueidentifier', generated: 'uuid' })
  uuid!: string;

  @ApiProperty({ required: false })
  @Column({ type: 'nvarchar', length: 150, nullable: true })
  libelle?: string | null;

  @ApiProperty()
  @Column({ name: 'caisse_id', type: 'bigint' })
  caisseId!: string;

  @ApiProperty({ description: 'Caissier détenteur du carnet' })
  @Column({ name: 'caissier_id', type: 'bigint' })
  caissierId!: string;

  @ApiProperty()
  @Column({ name: 'numero_debut', type: 'int' })
  numeroDebut!: number;

  @ApiProperty()
  @Column({ name: 'numero_fin', type: 'int' })
  numeroFin!: number;

  @ApiProperty({ description: 'Prochain numéro suggéré (incrémenté à chaque bon manuel).' })
  @Column({ name: 'prochain_numero', type: 'int' })
  prochainNumero!: number;

  @ApiProperty({ enum: ['ACTIF', 'EPUISE', 'CLOTURE'] })
  @Column({ type: 'nvarchar', length: 20, default: 'ACTIF' })
  statut!: CarnetStatut;
}
