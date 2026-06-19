import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';
import { decimalToString } from '@common/transformers/decimal.transformer';

@Entity({ name: 'trx_decaissement' })
export class Decaissement {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'bon_caisse_id', type: 'bigint' })
  bonCaisseId!: string;

  @Column({ name: 'caissier_id', type: 'bigint' })
  caissierId!: string;

  @Column({ name: 'beneficiaire_nom', type: 'nvarchar', length: 255 })
  beneficiaireNom!: string;

  @Column({ name: 'beneficiaire_piece', type: 'nvarchar', length: 100, nullable: true })
  beneficiairePiece?: string | null;

  @Column({ name: 'beneficiaire_telephone', type: 'nvarchar', length: 30, nullable: true })
  beneficiaireTelephone?: string | null;

  @Column({ type: 'decimal', precision: 19, scale: 4, transformer: decimalToString })
  montant!: string;

  @Column({ name: 'date_decaissement', type: 'datetime2', precision: 3 })
  dateDecaissement!: Date;

  @Column({ name: 'portefeuille_id', type: 'bigint' })
  portefeuilleId!: string;

  @CreateDateColumn({ name: 'created_at', type: 'datetime2', precision: 3 })
  createdAt!: Date;
}
