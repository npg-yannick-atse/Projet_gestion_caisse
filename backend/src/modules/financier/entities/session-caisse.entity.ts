import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

export type TypeCloture = 'AUTO_20H' | 'MANUEL';
export type SessionStatut = 'OUVERTE' | 'FERMEE';

@Entity({ name: 'fin_session_caisse' })
export class SessionCaisse {
  @ApiProperty()
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'caisse_id', type: 'bigint' })
  caisseId!: string;

  @Column({ name: 'date_ouverture', type: 'datetime2', precision: 3 })
  dateOuverture!: Date;

  @Column({ name: 'date_cloture', type: 'datetime2', precision: 3, nullable: true })
  dateCloture?: Date | null;

  @Column({ name: 'solde_ouverture', type: 'decimal', precision: 19, scale: 4, default: 0 })
  soldeOuverture!: string;

  @Column({ name: 'solde_cloture', type: 'decimal', precision: 19, scale: 4, nullable: true })
  soldeCloture?: string | null;

  @Column({ name: 'cloture_par_id', type: 'bigint', nullable: true })
  clotureParId?: string | null;

  @Column({ name: 'type_cloture', type: 'nvarchar', length: 20, nullable: true })
  typeCloture?: TypeCloture | null;

  @ApiProperty({ enum: ['OUVERTE', 'FERMEE'] })
  @Column({ type: 'nvarchar', length: 20, default: 'OUVERTE' })
  statut!: SessionStatut;

  @CreateDateColumn({ name: 'created_at', type: 'datetime2', precision: 3 })
  createdAt!: Date;

  @Column({ name: 'created_by_id', type: 'bigint', nullable: true })
  createdById?: string | null;
}
