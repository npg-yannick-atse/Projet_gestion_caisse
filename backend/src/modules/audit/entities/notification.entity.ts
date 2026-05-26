import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

export type TypeNotification =
  | 'BON_A_VALIDER'
  | 'BON_VALIDE'
  | 'BON_REFUSE'
  | 'BON_DECAISSE'
  | 'INTERIM_OUVERT'
  | 'INTERIM_FERME'
  | 'PERMISSION_ACCORDEE'
  | 'SYSTEME';

export type CanalNotification = 'PUSH' | 'EMAIL' | 'IN_APP';

@Entity({ name: 'aud_notification' })
export class Notification {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'destinataire_id', type: 'bigint' })
  destinataireId!: string;

  @Column({ name: 'type_notification', type: 'nvarchar', length: 30 })
  typeNotification!: TypeNotification;

  @Column({ name: 'entite_concernee', type: 'nvarchar', length: 50, nullable: true })
  entiteConcernee?: string | null;

  @Column({ name: 'entite_id', type: 'bigint', nullable: true })
  entiteId?: string | null;

  @Column({ type: 'nvarchar', length: 200 })
  titre!: string;

  @Column({ type: 'nvarchar', length: 'MAX' })
  message!: string;

  @Column({ type: 'nvarchar', length: 20, default: 'IN_APP' })
  canal!: CanalNotification;

  @Column({ name: 'est_lue', type: 'bit', default: false })
  estLue!: boolean;

  @Column({ name: 'date_lecture', type: 'datetime2', precision: 3, nullable: true })
  dateLecture?: Date | null;

  @CreateDateColumn({ name: 'date_creation', type: 'datetime2', precision: 3 })
  dateCreation!: Date;

  @Column({ name: 'date_envoi', type: 'datetime2', precision: 3, nullable: true })
  dateEnvoi?: Date | null;
}
