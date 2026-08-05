import { Entity, Column } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { AuditableEntity } from '@common/entities/base.entity';

export type PaiementSalaireStatut = 'PAYE' | 'ANNULE';
export type SourceFonds = 'CAISSE' | 'PORTEFEUILLE';

/**
 * Versement du salaire d'un employé, depuis une caisse ou un portefeuille.
 *
 * Un salaire se paie par mois : la période (AAAA-MM) porte l'unicité, un index
 * filtré empêchant de payer deux fois le même mois tant que le paiement n'est
 * pas annulé.
 */
@Entity({ name: 'fin_paiement_salaire' })
export class PaiementSalaire extends AuditableEntity {
  @ApiProperty()
  @Column({ name: 'employe_id', type: 'bigint' })
  employeId!: string;

  @ApiProperty({ description: 'Mois payé, au format AAAA-MM' })
  @Column({ type: 'nvarchar', length: 7 })
  periode!: string;

  @ApiProperty()
  @Column({ type: 'decimal', precision: 19, scale: 4 })
  montant!: string;

  @ApiProperty()
  @Column({ name: 'devise_id', type: 'bigint' })
  deviseId!: string;

  @ApiProperty({ enum: ['CAISSE', 'PORTEFEUILLE'] })
  @Column({ name: 'source_type', type: 'nvarchar', length: 20 })
  sourceType!: SourceFonds;

  @ApiProperty()
  @Column({ name: 'source_id', type: 'bigint' })
  sourceId!: string;

  /** Rattachement au grand livre : opération et écritures partagent cet UUID. */
  @ApiProperty({ required: false })
  @Column({ name: 'transaction_uuid', type: 'uniqueidentifier', nullable: true })
  transactionUuid?: string | null;

  @ApiProperty()
  @Column({ name: 'date_paiement', type: 'datetime2' })
  datePaiement!: Date;

  @ApiProperty({ enum: ['PAYE', 'ANNULE'] })
  @Column({ type: 'nvarchar', length: 20, default: 'PAYE' })
  statut!: PaiementSalaireStatut;

  @ApiProperty({ required: false })
  @Column({ type: 'nvarchar', length: 400, nullable: true })
  commentaire?: string | null;
}
