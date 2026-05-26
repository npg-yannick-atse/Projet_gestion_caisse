import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'aud_log_sap' })
export class LogSap {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'session_caisse_id', type: 'bigint', nullable: true })
  sessionCaisseId?: string | null;

  @Column({ name: 'outbox_id', type: 'bigint', nullable: true })
  outboxId?: string | null;

  @Column({ name: 'date_envoi', type: 'datetime2', precision: 3 })
  dateEnvoi!: Date;

  @Column({ type: 'nvarchar', length: 'MAX', nullable: true })
  payload?: string | null;

  @Column({ type: 'nvarchar', length: 20 })
  statut!: 'SUCCES' | 'ECHEC';

  @Column({ name: 'message_retour', type: 'nvarchar', length: 'MAX', nullable: true })
  messageRetour?: string | null;

  @Column({ name: 'nb_tentatives', type: 'int', default: 1 })
  nbTentatives!: number;
}
