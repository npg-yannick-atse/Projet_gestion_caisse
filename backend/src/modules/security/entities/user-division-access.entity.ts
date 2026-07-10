import { Entity, Column, PrimaryColumn, CreateDateColumn } from 'typeorm';

/**
 * Accès d'un utilisateur à une division (région d'un pays).
 * Requis pour créer une restitution client sur cette division.
 */
@Entity({ name: 'sec_user_division_access' })
export class UserDivisionAccess {
  @PrimaryColumn({ name: 'user_id', type: 'bigint' })
  userId!: string;

  @PrimaryColumn({ name: 'division_id', type: 'bigint' })
  divisionId!: string;

  @CreateDateColumn({ name: 'created_at', type: 'datetime2', precision: 3 })
  createdAt!: Date;

  @Column({ name: 'created_by_id', type: 'bigint', nullable: true })
  createdById?: string | null;
}
