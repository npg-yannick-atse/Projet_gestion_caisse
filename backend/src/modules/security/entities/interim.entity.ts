import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

export type InterimStatut = 'ACTIF' | 'EXPIRE' | 'REVOQUE';

@Entity({ name: 'sec_interim' })
export class Interim {
  @ApiProperty()
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'initiateur_id', type: 'bigint' })
  initiateurId!: string;

  @Column({ name: 'remplacant_id', type: 'bigint' })
  remplacantId!: string;

  @Column({ name: 'permission_id', type: 'bigint', nullable: true })
  permissionId?: string | null;

  @Column({ name: 'role_transferre_id', type: 'bigint', nullable: true })
  roleTransfereId?: string | null;

  @Column({ name: 'profil_transferre_id', type: 'bigint', nullable: true })
  profilTransfereId?: string | null;

  @Column({ name: 'date_debut', type: 'datetime2', precision: 3 })
  dateDebut!: Date;

  @Column({ name: 'date_fin', type: 'datetime2', precision: 3 })
  dateFin!: Date;

  @Column({ type: 'nvarchar', length: 500, nullable: true })
  commentaire?: string | null;

  @Column({ type: 'nvarchar', length: 20, default: 'ACTIF' })
  statut!: InterimStatut;

  @CreateDateColumn({ name: 'created_at', type: 'datetime2', precision: 3 })
  createdAt!: Date;

  @Column({ name: 'created_by_id', type: 'bigint', nullable: true })
  createdById?: string | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime2', precision: 3, nullable: true })
  updatedAt?: Date | null;

  @Column({ name: 'updated_by_id', type: 'bigint', nullable: true })
  updatedById?: string | null;
}
