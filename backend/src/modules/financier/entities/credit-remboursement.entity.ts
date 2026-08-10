import { Entity, Column } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { decimalToString } from '@common/transformers/decimal.transformer';
import { AuditableEntity } from '@common/entities/base.entity';

export type RemboursementStatut = 'ENCAISSE' | 'ANNULE';
export type RemboursementSource = 'CAISSE' | 'PORTEFEUILLE';

/**
 * Versement réellement encaissé au titre d'un crédit employé.
 *
 * Sans cette table, l'échéancier n'était qu'un calendrier : une mensualité
 * passait pour payée du simple fait que sa date était dépassée. Chaque ligne
 * ici est un constat, ce qui permet de distinguer le dû du versé et de voir
 * les retards.
 *
 * Comptablement, c'est l'inverse du décaissement : DÉBIT créance employé /
 * CRÉDIT source — l'argent revient dans la caisse.
 */
@Entity({ name: 'fin_credit_remboursement' })
export class CreditRemboursement extends AuditableEntity {
  @ApiProperty()
  @Column({ name: 'credit_id', type: 'bigint' })
  creditId!: string;

  @ApiProperty({ description: "Rang de l'échéance couverte (1 = première mensualité)" })
  @Column({ name: 'numero_echeance', type: 'int' })
  numeroEcheance!: number;

  @ApiProperty()
  @Column({ type: 'decimal', precision: 19, scale: 4, transformer: decimalToString })
  montant!: string;

  @ApiProperty()
  @Column({ name: 'devise_id', type: 'bigint' })
  deviseId!: string;

  @ApiProperty({ enum: ['CAISSE', 'PORTEFEUILLE'] })
  @Column({ name: 'source_type', type: 'nvarchar', length: 20 })
  sourceType!: RemboursementSource;

  @ApiProperty({ description: "Compte où l'argent est encaissé" })
  @Column({ name: 'source_id', type: 'bigint' })
  sourceId!: string;

  @ApiProperty({ required: false })
  @Column({ name: 'transaction_uuid', type: 'uniqueidentifier', nullable: true })
  transactionUuid?: string | null;

  @ApiProperty()
  @Column({ name: 'date_remboursement', type: 'datetime2', precision: 3 })
  dateRemboursement!: Date;

  @ApiProperty({ enum: ['ENCAISSE', 'ANNULE'], default: 'ENCAISSE' })
  @Column({ type: 'nvarchar', length: 20, default: 'ENCAISSE' })
  statut!: RemboursementStatut;

  @ApiProperty({ required: false })
  @Column({ type: 'nvarchar', length: 400, nullable: true })
  commentaire?: string | null;

  /**
   * Paiement de salaire qui a produit cette retenue, s'il y en a un.
   *
   * Renseigné uniquement pour les mensualités prélevées automatiquement : sans
   * ce lien, une retenue serait indistinguable d'un versement encaissé au
   * guichet, et l'annulation du paiement de salaire ne saurait pas laquelle
   * contre-passer.
   */
  @ApiProperty({ required: false })
  @Column({ name: 'paiement_salaire_id', type: 'bigint', nullable: true })
  paiementSalaireId?: string | null;
}
