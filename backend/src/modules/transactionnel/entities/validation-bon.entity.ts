import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

export type ValidationAction = 'VALIDE' | 'REFUSE' | 'SIGNE';

@Entity({ name: 'trx_validation_bon' })
export class ValidationBon {
  @ApiProperty()
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'bon_id', type: 'bigint', nullable: true })
  bonId?: string | null;

  @Column({ name: 'sous_bon_id', type: 'bigint', nullable: true })
  sousBonId?: string | null;

  @Column({ name: 'validateur_id', type: 'bigint' })
  validateurId!: string;

  @Column({ name: 'validateur_interim_id', type: 'bigint', nullable: true })
  validateurInterimId?: string | null;

  @ApiProperty({ default: 1 })
  @Column({ name: 'niveau_validation', type: 'int', default: 1 })
  niveauValidation!: number;

  @ApiProperty({ default: 1 })
  @Column({ type: 'int', default: 1 })
  ordre!: number;

  @ApiProperty({ default: true })
  @Column({ name: 'est_obligatoire', type: 'bit', default: true })
  estObligatoire!: boolean;

  @ApiProperty({ enum: ['VALIDE', 'REFUSE', 'SIGNE'] })
  @Column({ type: 'nvarchar', length: 20 })
  action!: ValidationAction;

  @Column({ name: 'date_validation', type: 'datetime2', precision: 3 })
  dateValidation!: Date;

  @Column({ type: 'nvarchar', length: 500, nullable: true })
  commentaire?: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime2', precision: 3 })
  createdAt!: Date;
}
