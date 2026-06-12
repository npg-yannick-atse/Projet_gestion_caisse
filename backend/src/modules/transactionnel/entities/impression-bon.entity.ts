import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity({ name: 'trx_impression_bon' })
export class ImpressionBon {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'bon_id', type: 'bigint', nullable: true })
  bonId?: string | null;

  @Column({ name: 'sous_bon_id', type: 'bigint', nullable: true })
  sousBonId?: string | null;

  @Column({ name: 'imprime_par_id', type: 'bigint' })
  imprimeParId!: string;

  @Column({ name: 'date_impression', type: 'datetime2', precision: 3 })
  dateImpression!: Date;

  @Column({ name: 'a_signe', type: 'bit', default: false })
  aSigne!: boolean;

  @Column({ name: 'date_signature', type: 'datetime2', precision: 3, nullable: true })
  dateSignature?: Date | null;

  @Column({ name: 'signature_image', type: 'nvarchar', length: 'MAX', nullable: true })
  signatureImage?: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime2', precision: 3 })
  createdAt!: Date;
}
