import { Entity, Column } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { decimalToString } from '@common/transformers/decimal.transformer';
import { AuditableEntity } from '@common/entities/base.entity';

export type CreditStatut = 'EN_COURS' | 'SOLDE';
export type CreditSource = 'CAISSE' | 'PORTEFEUILLE';

/**
 * Crédit accordé à un employé, décaissé réellement depuis une caisse ou un
 * portefeuille. Un seul crédit EN_COURS par employé (index unique filtré
 * UQ_fin_credit_encours, migration 0021). Pas de suivi de remboursement : la
 * mensualité (montant ÷ nbMois) et la date de fin sont calculées à l'affichage.
 */
@Entity({ name: 'fin_credit' })
export class Credit extends AuditableEntity {
  @ApiProperty()
  @Column({ name: 'employe_id', type: 'bigint' })
  employeId!: string;

  @ApiProperty()
  @Column({ type: 'decimal', precision: 19, scale: 4, transformer: decimalToString })
  montant!: string;

  @ApiProperty()
  @Column({ name: 'nb_mois', type: 'int' })
  nbMois!: number;

  @ApiProperty({ enum: ['CAISSE', 'PORTEFEUILLE'] })
  @Column({ name: 'source_type', type: 'nvarchar', length: 20 })
  sourceType!: CreditSource;

  @ApiProperty()
  @Column({ name: 'source_id', type: 'bigint' })
  sourceId!: string;

  @ApiProperty()
  @Column({ name: 'devise_id', type: 'bigint' })
  deviseId!: string;

  @ApiProperty({ enum: ['EN_COURS', 'SOLDE'], default: 'EN_COURS' })
  @Column({ type: 'nvarchar', length: 20, default: 'EN_COURS' })
  statut!: CreditStatut;

  @ApiProperty()
  @Column({ name: 'date_debut', type: 'date' })
  dateDebut!: string;

  @ApiProperty({ required: false })
  @Column({ name: 'transaction_uuid', type: 'uniqueidentifier', nullable: true })
  transactionUuid?: string | null;

  @ApiProperty({ required: false })
  @Column({ type: 'nvarchar', length: 'MAX', nullable: true })
  commentaire?: string | null;
}
