import { Entity, Column, PrimaryColumn, CreateDateColumn } from 'typeorm';

/**
 * Rôle porté par un PROFIL (migration 0068).
 *
 * Ce qui fait qu'on est administrateur, ou qu'on passe le verrou d'entrée de
 * l'application, tient au CODE du rôle — pas à une permission. Sans cette
 * table, un profil ne pouvait transmettre ni l'un ni l'autre.
 */
@Entity({ name: 'sec_profil_role' })
export class ProfilRole {
  @PrimaryColumn({ name: 'profil_id', type: 'bigint' })
  profilId!: string;

  @PrimaryColumn({ name: 'role_id', type: 'bigint' })
  roleId!: string;

  @CreateDateColumn({ name: 'created_at', type: 'datetime2', precision: 3 })
  createdAt!: Date;

  @Column({ name: 'created_by_id', type: 'bigint', nullable: true })
  createdById?: string | null;
}
