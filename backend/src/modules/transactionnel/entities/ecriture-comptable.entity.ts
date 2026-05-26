import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm';

export type TypeCompte = 'CAISSE' | 'PORTEFEUILLE' | 'GAIN_CHANGE' | 'PERTE_CHANGE';

/**
 * Ecriture comptable en partie double (cf. Partie IV Niveau 1.1).
 * IMMUABLE : aucune UPDATE ne doit etre executee sur cette table.
 * Le solde d'un compte = SUM(credit) - SUM(debit) sur l'agregat.
 * hash_integrite chaine les ecritures pour detecter une falsification directe.
 */
@Entity({ name: 'trx_ecriture_comptable' })
@Index(['transactionUuid'])
@Index(['compteId', 'typeCompte', 'dateEcriture'])
export class EcritureComptable {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'transaction_uuid', type: 'uniqueidentifier' })
  transactionUuid!: string;

  @Column({ name: 'compte_id', type: 'bigint' })
  compteId!: string;

  @Column({ name: 'type_compte', type: 'nvarchar', length: 20 })
  typeCompte!: TypeCompte;

  @Column({ name: 'plan_comptable_id', type: 'bigint', nullable: true })
  planComptableId?: string | null;

  @Column({ name: 'cost_center_id', type: 'bigint', nullable: true })
  costCenterId?: string | null;

  @Column({ type: 'decimal', precision: 19, scale: 4, nullable: true })
  debit?: string | null;

  @Column({ type: 'decimal', precision: 19, scale: 4, nullable: true })
  credit?: string | null;

  @Column({ name: 'devise_id', type: 'bigint' })
  deviseId!: string;

  @Column({ name: 'reference_bon_id', type: 'bigint', nullable: true })
  referenceBonId?: string | null;

  @Column({ name: 'reference_sous_bon_id', type: 'bigint', nullable: true })
  referenceSousBonId?: string | null;

  @Column({ name: 'date_ecriture', type: 'datetime2', precision: 3 })
  dateEcriture!: Date;

  @Column({ name: 'hash_integrite', type: 'nvarchar', length: 64 })
  hashIntegrite!: string;

  @Column({ name: 'hash_precedent', type: 'nvarchar', length: 64, nullable: true })
  hashPrecedent?: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime2', precision: 3 })
  createdAt!: Date;
}
