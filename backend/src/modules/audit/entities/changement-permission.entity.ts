import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

export type TypeChangementPermission = 'GAIN' | 'PERTE';
export type SourcePermission = 'ROLE' | 'PROFIL' | 'EXTRA' | 'INTERIM';

/**
 * Trace tous les changements de droits sur un utilisateur (append-only).
 */
@Entity({ name: 'aud_changement_permission' })
export class ChangementPermission {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'user_concerne_id', type: 'bigint' })
  userConcerneId!: string;

  @Column({ name: 'permission_id', type: 'bigint' })
  permissionId!: string;

  @Column({ name: 'type_action', type: 'nvarchar', length: 10 })
  typeAction!: TypeChangementPermission;

  @Column({ type: 'nvarchar', length: 20 })
  source!: SourcePermission;

  @Column({ name: 'source_id', type: 'bigint', nullable: true })
  sourceId?: string | null;

  @Column({ name: 'acteur_id', type: 'bigint' })
  acteurId!: string;

  @CreateDateColumn({ name: 'date_action', type: 'datetime2', precision: 3 })
  dateAction!: Date;

  @Column({ name: 'adresse_ip', type: 'nvarchar', length: 45, nullable: true })
  adresseIp?: string | null;

  @Column({ type: 'nvarchar', length: 500, nullable: true })
  motif?: string | null;
}
