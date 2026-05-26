import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

/**
 * Journal d'audit append-only.
 * Aucun UPDATE ni DELETE ne doit etre execute sur cette table.
 */
@Entity({ name: 'aud_journal' })
export class JournalAudit {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'user_id', type: 'bigint', nullable: true })
  userId?: string | null;

  @Column({ type: 'nvarchar', length: 100 })
  action!: string;

  @Column({ name: 'entite_concernee', type: 'nvarchar', length: 100 })
  entiteConcernee!: string;

  @Column({ name: 'entite_id', type: 'bigint', nullable: true })
  entiteId?: string | null;

  @Column({ name: 'ancienne_valeur', type: 'nvarchar', length: 'MAX', nullable: true })
  ancienneValeur?: string | null;

  @Column({ name: 'nouvelle_valeur', type: 'nvarchar', length: 'MAX', nullable: true })
  nouvelleValeur?: string | null;

  @CreateDateColumn({ name: 'date_action', type: 'datetime2', precision: 3 })
  dateAction!: Date;

  @Column({ name: 'adresse_ip', type: 'nvarchar', length: 45, nullable: true })
  adresseIp?: string | null;

  @Column({ name: 'user_agent', type: 'nvarchar', length: 500, nullable: true })
  userAgent?: string | null;
}
