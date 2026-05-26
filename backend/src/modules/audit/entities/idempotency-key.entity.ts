import { Entity, Column, PrimaryColumn, CreateDateColumn } from 'typeorm';

/**
 * Cle d'idempotence (cf. Partie IV Niveau 2.1).
 * Anti-doublon sur les operations financieres.
 */
@Entity({ name: 'aud_idempotency_key' })
export class IdempotencyKey {
  @PrimaryColumn({ type: 'uniqueidentifier' })
  cle!: string;

  @Column({ name: 'user_id', type: 'bigint' })
  userId!: string;

  @Column({ type: 'nvarchar', length: 255 })
  endpoint!: string;

  @Column({ name: 'hash_requete', type: 'nvarchar', length: 64 })
  hashRequete!: string;

  @Column({ name: 'reponse_cachee', type: 'nvarchar', length: 'MAX', nullable: true })
  reponseCachee?: string | null;

  @Column({ type: 'nvarchar', length: 20, default: 'EN_COURS' })
  statut!: 'EN_COURS' | 'TERMINE' | 'ECHEC';

  @Column({ name: 'expire_le', type: 'datetime2', precision: 3 })
  expireLe!: Date;

  @CreateDateColumn({ name: 'created_at', type: 'datetime2', precision: 3 })
  createdAt!: Date;
}
