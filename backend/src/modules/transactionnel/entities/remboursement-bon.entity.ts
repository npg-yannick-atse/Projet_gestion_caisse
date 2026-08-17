import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { decimalToString } from '@common/transformers/decimal.transformer';

/**
 * Part d'un bon décaissé qui revient à la caisse (migration 0074).
 *
 * Un bon de 100 000 dont la dépense réelle est de 70 000 laisse 30 000 à
 * rendre. Le bon n'est PAS réécrit : il garde ce qui a été autorisé, et le
 * remboursement dit ce qui est revenu. On lit ainsi les trois faits — autorisé,
 * sorti, rendu — plutôt que le seul résultat.
 *
 * Pas de suppression logique : une pièce financière ne s'efface pas. Une erreur
 * se corrige par une écriture qui la contredit, jamais par un effacement.
 */
@Entity({ name: 'trx_remboursement_bon' })
export class RemboursementBon {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @ApiProperty()
  @Column({ name: 'bon_id', type: 'bigint' })
  bonId!: string;

  /** Le sous-bon porte la caisse, la devise et le centre de coût : c'est lui qui a été décaissé. */
  @ApiProperty()
  @Column({ name: 'sous_bon_id', type: 'bigint' })
  sousBonId!: string;

  @ApiProperty()
  @Column({ name: 'caisse_id', type: 'bigint' })
  caisseId!: string;

  @ApiProperty()
  @Column({ name: 'devise_id', type: 'bigint' })
  deviseId!: string;

  @ApiProperty()
  @Column({ type: 'decimal', precision: 19, scale: 4, transformer: decimalToString })
  montant!: string;

  @ApiProperty({ required: false })
  @Column({ type: 'nvarchar', length: 500, nullable: true })
  motif?: string | null;

  /** Relie les deux écritures en partie double, comme toute opération. */
  @ApiProperty()
  @Column({ name: 'transaction_uuid', type: 'uniqueidentifier' })
  transactionUuid!: string;

  @ApiProperty()
  @CreateDateColumn({ name: 'created_at', type: 'datetime2', precision: 3 })
  createdAt!: Date;

  @ApiProperty({ required: false })
  @Column({ name: 'created_by_id', type: 'bigint', nullable: true })
  createdById?: string | null;
}
