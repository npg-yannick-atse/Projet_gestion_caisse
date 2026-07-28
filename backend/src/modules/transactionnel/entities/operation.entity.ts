import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';
import { decimalToString } from '@common/transformers/decimal.transformer';

export type TypeOperation =
  | 'RECHARGE'
  | 'DECAISSEMENT'
  | 'TRANSFERT'
  | 'AJUSTEMENT'
  /** Entrée d'argent dans une caisse (client, dotation…). Miroir du décaissement. */
  | 'ENCAISSEMENT'
  /** Décaissement d'un crédit accordé à un employé. */
  | 'CREDIT';

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

  // Renseignés pour les encaissements (nullable pour les autres opérations).
  @Column({ name: 'client_nom', type: 'nvarchar', length: 200, nullable: true })
  clientNom?: string | null;

  @Column({ name: 'client_numero', type: 'nvarchar', length: 50, nullable: true })
  clientNumero?: string | null;

  @Column({ type: 'nvarchar', length: 200, nullable: true })
  motif?: string | null;

  /* -------- Intégration SAP (envoi comptable, idempotence) -------- */

  @Column({ name: 'sap_piece', type: 'nvarchar', length: 20, nullable: true })
  sapPiece?: string | null;

  @Column({ name: 'sap_statut', type: 'nvarchar', length: 20, nullable: true })
  sapStatut?: string | null; // ENVOYE / ERREUR

  @Column({ name: 'sap_date', type: 'datetime2', precision: 3, nullable: true })
  sapDate?: Date | null;

  @Column({ name: 'sap_message', type: 'nvarchar', length: 500, nullable: true })
  sapMessage?: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime2', precision: 3 })
  createdAt!: Date;
}
