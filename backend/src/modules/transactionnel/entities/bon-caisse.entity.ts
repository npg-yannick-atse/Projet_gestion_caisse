import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

@Entity({ name: 'trx_bon_caisse' })
export class BonCaisse {
  @ApiProperty()
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ type: 'uniqueidentifier', generated: 'uuid' })
  uuid!: string;

  @Column({ name: 'bon_source_id', type: 'bigint', nullable: true })
  bonSourceId?: string | null;

  @Column({ name: 'sous_bon_source_id', type: 'bigint', nullable: true })
  sousBonSourceId?: string | null;

  @Column({ name: 'caissier_id', type: 'bigint' })
  caissierId!: string;

  @Column({ name: 'date_duplication', type: 'datetime2', precision: 3 })
  dateDuplication!: Date;

  @Column({ name: 'contenu_modifie', type: 'nvarchar', length: 'MAX', nullable: true })
  contenuModifie?: string | null;

  @Column({ type: 'nvarchar', length: 255, nullable: true })
  beneficiaire?: string | null;

  @ApiProperty()
  @Column({ type: 'nvarchar', length: 20, default: 'CREE' })
  statut!: string;

  @CreateDateColumn({ name: 'created_at', type: 'datetime2', precision: 3 })
  createdAt!: Date;
}
