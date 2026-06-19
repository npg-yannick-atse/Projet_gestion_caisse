import { Entity, Column } from 'typeorm';
import { decimalToString } from '@common/transformers/decimal.transformer';
import { ApiProperty } from '@nestjs/swagger';
import { AuditableEntity } from '@common/entities/base.entity';

export type TransfertCompteType = 'CAISSE' | 'PORTEFEUILLE';
export type DemandeTransfertStatut =
  | 'CREE'
  | 'APPROUVEE'
  | 'REJETEE'
  | 'EXECUTEE'
  | 'ANNULEE';

/**
 * Demande de transfert de fonds entre deux comptes (caisse ↔ portefeuille).
 * Workflow :
 *   CREE → APPROUVEE → EXECUTEE
 *        ↘ REJETEE
 *        ↘ ANNULEE  (par le demandeur lui-même)
 *
 * L'exécution crée une opération de type TRANSFERT côté Ledger.
 */
@Entity({ name: 'fin_demande_transfert' })
export class DemandeTransfert extends AuditableEntity {
  @ApiProperty()
  @Column({ type: 'nvarchar', length: 50, unique: true })
  numero!: string;

  @Column({ name: 'demandeur_id', type: 'bigint' })
  demandeurId!: string;

  @ApiProperty({ enum: ['CAISSE', 'PORTEFEUILLE'] })
  @Column({ name: 'source_type', type: 'nvarchar', length: 20 })
  sourceType!: TransfertCompteType;

  @Column({ name: 'source_id', type: 'bigint' })
  sourceId!: string;

  @ApiProperty({ enum: ['CAISSE', 'PORTEFEUILLE'] })
  @Column({ name: 'destination_type', type: 'nvarchar', length: 20 })
  destinationType!: TransfertCompteType;

  @Column({ name: 'destination_id', type: 'bigint' })
  destinationId!: string;

  @ApiProperty({ description: 'Montant DECIMAL(19,4)' })
  @Column({ type: 'decimal', precision: 19, scale: 4, transformer: decimalToString })
  montant!: string;

  @Column({ name: 'devise_id', type: 'bigint' })
  deviseId!: string;

  @ApiProperty({ required: false })
  @Column({ type: 'nvarchar', length: 500, nullable: true })
  motif?: string | null;

  @ApiProperty({
    enum: ['CREE', 'APPROUVEE', 'REJETEE', 'EXECUTEE', 'ANNULEE'],
    default: 'CREE',
  })
  @Column({ type: 'nvarchar', length: 20, default: 'CREE' })
  statut!: DemandeTransfertStatut;

  @Column({ name: 'validateur_id', type: 'bigint', nullable: true })
  validateurId?: string | null;

  @Column({ name: 'date_validation', type: 'datetime2', precision: 3, nullable: true })
  dateValidation?: Date | null;

  @Column({ name: 'commentaire_validation', type: 'nvarchar', length: 500, nullable: true })
  commentaireValidation?: string | null;

  @Column({ name: 'executeur_id', type: 'bigint', nullable: true })
  executeurId?: string | null;

  @Column({ name: 'date_execution', type: 'datetime2', precision: 3, nullable: true })
  dateExecution?: Date | null;

  @Column({ name: 'transaction_uuid', type: 'uniqueidentifier', nullable: true })
  transactionUuid?: string | null;
}
