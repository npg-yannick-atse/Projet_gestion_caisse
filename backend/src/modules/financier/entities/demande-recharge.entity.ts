import { Entity, Column } from 'typeorm';
import { decimalToString } from '@common/transformers/decimal.transformer';
import { ApiProperty } from '@nestjs/swagger';
import { AuditableEntity } from '@common/entities/base.entity';

export type DemandeRechargeStatut = 'EN_ATTENTE' | 'TRAITEE' | 'REJETEE' | 'ANNULEE';

/**
 * Demande de recharge initiée par un demandeur : il saisit juste un montant + motif,
 * sans choisir de portefeuille. Le système cible automatiquement SON portefeuille.
 * Un caissier la traite (= effectue la recharge réelle) en une étape.
 *
 * Workflow : EN_ATTENTE → TRAITEE (recharge faite)
 *                       ↘ REJETEE (par le caissier)
 *                       ↘ ANNULEE (par le demandeur)
 */
@Entity({ name: 'fin_demande_recharge' })
export class DemandeRecharge extends AuditableEntity {
  @ApiProperty()
  @Column({ type: 'nvarchar', length: 50, unique: true })
  numero!: string;

  @Column({ name: 'demandeur_id', type: 'bigint' })
  demandeurId!: string;

  @ApiProperty({ description: 'Portefeuille cible, résolu automatiquement à la création' })
  @Column({ name: 'portefeuille_id', type: 'bigint' })
  portefeuilleId!: string;

  @ApiProperty({ description: 'Montant DECIMAL(19,4)' })
  @Column({ type: 'decimal', precision: 19, scale: 4, transformer: decimalToString })
  montant!: string;

  @ApiProperty({ required: false })
  @Column({ type: 'nvarchar', length: 500, nullable: true })
  motif?: string | null;

  @ApiProperty({ enum: ['EN_ATTENTE', 'TRAITEE', 'REJETEE', 'ANNULEE'], default: 'EN_ATTENTE' })
  @Column({ type: 'nvarchar', length: 20, default: 'EN_ATTENTE' })
  statut!: DemandeRechargeStatut;

  @Column({ name: 'traite_par_id', type: 'bigint', nullable: true })
  traiteParId?: string | null;

  @Column({ name: 'date_traitement', type: 'datetime2', precision: 3, nullable: true })
  dateTraitement?: Date | null;

  @Column({ name: 'commentaire_traitement', type: 'nvarchar', length: 500, nullable: true })
  commentaireTraitement?: string | null;

  @ApiProperty({ required: false, description: 'UUID de la transaction de recharge générée au traitement' })
  @Column({ name: 'transaction_uuid', type: 'uniqueidentifier', nullable: true })
  transactionUuid?: string | null;
}
