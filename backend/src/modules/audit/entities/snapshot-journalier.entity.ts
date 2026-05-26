import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity({ name: 'aud_snapshot_journalier' })
export class SnapshotJournalier {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'date_snapshot', type: 'date' })
  dateSnapshot!: string;

  @Column({ name: 'caisse_id', type: 'bigint' })
  caisseId!: string;

  @Column({ name: 'solde_calcule_ecritures', type: 'decimal', precision: 19, scale: 4 })
  soldeCalculeEcritures!: string;

  @Column({ name: 'solde_caisse_table', type: 'decimal', precision: 19, scale: 4 })
  soldeCaisseTable!: string;

  @Column({ name: 'solde_sap', type: 'decimal', precision: 19, scale: 4, nullable: true })
  soldeSap?: string | null;

  @Column({ type: 'decimal', precision: 19, scale: 4, default: 0 })
  ecart!: string;

  @Column({ name: 'statut_reconciliation', type: 'nvarchar', length: 20 })
  statutReconciliation!: 'CONFORME' | 'ECART_FAIBLE' | 'ECART_CRITIQUE' | 'NON_RECONCILIE';

  @CreateDateColumn({ name: 'created_at', type: 'datetime2', precision: 3 })
  createdAt!: Date;
}
