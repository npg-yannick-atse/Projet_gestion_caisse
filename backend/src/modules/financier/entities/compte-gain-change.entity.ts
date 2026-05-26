import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity({ name: 'fin_compte_gain_change' })
export class CompteGainChange {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'devise_id', type: 'bigint', unique: true })
  deviseId!: string;

  @Column({ type: 'nvarchar', length: 500, nullable: true })
  description?: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime2', precision: 3 })
  createdAt!: Date;
}
