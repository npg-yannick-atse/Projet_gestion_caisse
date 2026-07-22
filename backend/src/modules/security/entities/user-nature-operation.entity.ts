import { Entity, Column, PrimaryColumn, CreateDateColumn } from 'typeorm';

/**
 * Nature d'opération autorisée pour un utilisateur (liste blanche).
 * Requis pour choisir cette nature à la création d'un bon.
 *
 * Sémantique stricte : aucune ligne = aucune nature autorisée (donc aucun bon
 * possible), sauf pour les administrateurs qui ne sont pas restreints.
 * Même forme que UserDivisionAccess.
 */
@Entity({ name: 'sec_user_nature_operation' })
export class UserNatureOperation {
  @PrimaryColumn({ name: 'user_id', type: 'bigint' })
  userId!: string;

  @PrimaryColumn({ name: 'nature_operation_id', type: 'bigint' })
  natureOperationId!: string;

  @CreateDateColumn({ name: 'created_at', type: 'datetime2', precision: 3 })
  createdAt!: Date;

  @Column({ name: 'created_by_id', type: 'bigint', nullable: true })
  createdById?: string | null;
}
