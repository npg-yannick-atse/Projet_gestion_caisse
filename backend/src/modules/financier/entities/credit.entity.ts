import { Entity, Column } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { decimalToString } from '@common/transformers/decimal.transformer';
import { AuditableEntity } from '@common/entities/base.entity';

export type CreditStatut =
  | 'EN_ATTENTE'
  | 'APPROUVEE'
  | 'EN_COURS'
  | 'SOLDE'
  | 'REJETEE'
  | 'ANNULEE';
export type CreditSource = 'CAISSE' | 'PORTEFEUILLE';

/**
 * Crédit accordé à un employé, via un WORKFLOW de validation :
 *   EN_ATTENTE (demande) → APPROUVEE (DAF) → EN_COURS (décaissé par caissier) → SOLDE
 *   ↘ REJETEE (DAF)   ↘ ANNULEE (demandeur)
 * Le décaissement réel (opération CREDIT + écritures DÉBIT source / CRÉDIT créance)
 * n'a lieu qu'au passage EN_COURS. Un seul crédit ACTIF par employé (index unique
 * filtré UQ_fin_credit_actif, migration 0024). Pas de suivi de remboursement : la
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

  @ApiProperty({
    enum: ['EN_ATTENTE', 'APPROUVEE', 'EN_COURS', 'SOLDE', 'REJETEE', 'ANNULEE'],
    default: 'EN_ATTENTE',
  })
  @Column({ type: 'nvarchar', length: 20, default: 'EN_ATTENTE' })
  statut!: CreditStatut;

  @ApiProperty({ description: 'Date de début du prêt (fixée au décaissement)' })
  @Column({ name: 'date_debut', type: 'date' })
  dateDebut!: string;

  @ApiProperty({ required: false })
  @Column({ name: 'transaction_uuid', type: 'uniqueidentifier', nullable: true })
  transactionUuid?: string | null;

  @ApiProperty({ required: false })
  @Column({ type: 'nvarchar', length: 'MAX', nullable: true })
  commentaire?: string | null;

  // --- Workflow de validation ---
  @ApiProperty({ required: false, description: 'DAF ayant approuvé / rejeté' })
  @Column({ name: 'validateur_id', type: 'bigint', nullable: true })
  validateurId?: string | null;

  @Column({ name: 'date_validation', type: 'datetime2', precision: 3, nullable: true })
  dateValidation?: Date | null;

  @ApiProperty({ required: false, description: 'Motif de rejet (le cas échéant)' })
  @Column({ name: 'commentaire_validation', type: 'nvarchar', length: 500, nullable: true })
  commentaireValidation?: string | null;

  @ApiProperty({ required: false, description: 'Caissier ayant décaissé' })
  @Column({ name: 'decaisse_par_id', type: 'bigint', nullable: true })
  decaisseParId?: string | null;

  @Column({ name: 'date_decaissement', type: 'datetime2', precision: 3, nullable: true })
  dateDecaissement?: Date | null;
}
