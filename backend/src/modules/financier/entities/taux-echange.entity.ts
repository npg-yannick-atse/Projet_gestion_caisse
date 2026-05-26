import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

export type SourceTaux = 'FIXE_DB' | 'API';

@Entity({ name: 'fin_taux_echange' })
export class TauxEchange {
  @ApiProperty()
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'devise_source_id', type: 'bigint' })
  deviseSourceId!: string;

  @Column({ name: 'devise_cible_id', type: 'bigint' })
  deviseCibleId!: string;

  @ApiProperty()
  @Column({ type: 'decimal', precision: 19, scale: 8 })
  taux!: string;

  @Column({ name: 'date_validite_debut', type: 'datetime2', precision: 3 })
  dateValiditeDebut!: Date;

  @Column({ name: 'date_validite_fin', type: 'datetime2', precision: 3, nullable: true })
  dateValiditeFin?: Date | null;

  @ApiProperty({ enum: ['FIXE_DB', 'API'] })
  @Column({ type: 'nvarchar', length: 20 })
  source!: SourceTaux;

  @CreateDateColumn({ name: 'created_at', type: 'datetime2', precision: 3 })
  createdAt!: Date;

  @Column({ name: 'created_by_id', type: 'bigint', nullable: true })
  createdById?: string | null;
}
