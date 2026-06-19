import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';
import { decimalToString } from '@common/transformers/decimal.transformer';

export type TypeOperation = 'RECHARGE' | 'DECAISSEMENT' | 'TRANSFERT' | 'AJUSTEMENT';

@Entity({ name: 'trx_operation' })
export class Operation {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'transaction_uuid', type: 'uniqueidentifier' })
  transactionUuid!: string;

  @Column({ name: 'type_operation', type: 'nvarchar', length: 20 })
  typeOperation!: TypeOperation;

  @Column({ name: 'caisse_id', type: 'bigint', nullable: true })
  caisseId?: string | null;

  @Column({ name: 'portefeuille_id', type: 'bigint', nullable: true })
  portefeuilleId?: string | null;

  @Column({ type: 'decimal', precision: 19, scale: 4, transformer: decimalToString })
  montant!: string;

  @Column({ name: 'devise_id', type: 'bigint' })
  deviseId!: string;

  @Column({ name: 'date_operation', type: 'datetime2', precision: 3 })
  dateOperation!: Date;

  @Column({ name: 'user_id', type: 'bigint' })
  userId!: string;

  @Column({ type: 'nvarchar', length: 100, nullable: true })
  reference?: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime2', precision: 3 })
  createdAt!: Date;
}
