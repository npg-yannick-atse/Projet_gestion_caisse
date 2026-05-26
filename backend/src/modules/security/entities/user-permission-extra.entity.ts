import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

export type ScopeType = 'CAISSE' | 'BON' | 'PORTEFEUILLE' | 'SOUS_BON' | 'PARTENAIRE';

@Entity({ name: 'sec_user_permission_extra' })
export class UserPermissionExtra {
  @ApiProperty()
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'user_id', type: 'bigint' })
  userId!: string;

  @Column({ name: 'permission_id', type: 'bigint' })
  permissionId!: string;

  @Column({ name: 'scope_type', type: 'nvarchar', length: 20, nullable: true })
  scopeType?: ScopeType | null;

  @Column({ name: 'scope_id', type: 'bigint', nullable: true })
  scopeId?: string | null;

  @Column({ name: 'date_debut', type: 'datetime2', precision: 3, nullable: true })
  dateDebut?: Date | null;

  @Column({ name: 'date_fin', type: 'datetime2', precision: 3, nullable: true })
  dateFin?: Date | null;

  @Column({ name: 'accorde_par_id', type: 'bigint', nullable: true })
  accordeParId?: string | null;

  @Column({ type: 'nvarchar', length: 500, nullable: true })
  motif?: string | null;

  @Column({ name: 'est_actif', type: 'bit', default: true })
  estActif!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'datetime2', precision: 3 })
  createdAt!: Date;
}
