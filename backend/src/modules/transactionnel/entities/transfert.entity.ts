import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';
import { decimalToString } from '@common/transformers/decimal.transformer';

export type TransfertStatut =
  | 'INITIE'
  | 'DEBIT_SOURCE_OK'
  | 'CREDIT_CIBLE_OK'
  | 'ECRITURE_CHANGE_OK'
  | 'TERMINE'
  | 'COMPENSATION'
  | 'ANNULE';

@Entity({ name: 'trx_transfert' })
export class Transfert {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'caisse_source_id', type: 'bigint' })
  caisseSourceId!: string;

  @Column({ name: 'caisse_cible_id', type: 'bigint', nullable: true })
  caisseCibleId?: string | null;

  @Column({ name: 'portefeuille_cible_id', type: 'bigint', nullable: true })
  portefeuilleCibleId?: string | null;

  @Column({ name: 'montant_source', type: 'decimal', precision: 19, scale: 4, transformer: decimalToString })
  montantSource!: string;

  @Column({ name: 'montant_cible', type: 'decimal', precision: 19, scale: 4, transformer: decimalToString })
  montantCible!: string;

  @Column({ name: 'devise_source_id', type: 'bigint' })
  deviseSourceId!: string;

  @Column({ name: 'devise_cible_id', type: 'bigint' })
  deviseCibleId!: string;

  @Column({ name: 'taux_applique', type: 'decimal', precision: 19, scale: 8, transformer: decimalToString })
  tauxApplique!: string;

  @Column({ name: 'montant_gain', type: 'decimal', precision: 19, scale: 4, transformer: decimalToString, default: 0 })
  montantGain!: string;

  @Column({ name: 'montant_perte', type: 'decimal', precision: 19, scale: 4, transformer: decimalToString, default: 0 })
  montantPerte!: string;

  @Column({ name: 'date_transfert', type: 'datetime2', precision: 3 })
  dateTransfert!: Date;

  @Column({ name: 'initiateur_id', type: 'bigint' })
  initiateurId!: string;

  @Column({ type: 'nvarchar', length: 30, default: 'INITIE' })
  statut!: TransfertStatut;

  @CreateDateColumn({ name: 'created_at', type: 'datetime2', precision: 3 })
  createdAt!: Date;
}
