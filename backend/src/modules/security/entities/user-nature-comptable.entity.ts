import { Entity, Column, PrimaryColumn, CreateDateColumn } from 'typeorm';

/**
 * Natures comptables autorisées à une personne.
 *
 * Remplace la table équivalente qui portait sur « nature d'opération » : ce
 * concept a disparu (migration 0070), le métier ne connaissant que le plan
 * comptable.
 */
@Entity({ name: 'sec_user_nature_comptable' })
export class UserNatureComptable {
  @PrimaryColumn({ name: 'user_id', type: 'bigint' })
  userId!: string;

  @PrimaryColumn({ name: 'nature_comptable_id', type: 'bigint' })
  natureComptableId!: string;

  @CreateDateColumn({ name: 'created_at', type: 'datetime2', precision: 3 })
  createdAt!: Date;

  @Column({ name: 'created_by_id', type: 'bigint', nullable: true })
  createdById?: string | null;
}
