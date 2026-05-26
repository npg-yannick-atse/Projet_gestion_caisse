import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

export type OutboxStatut = 'EN_ATTENTE' | 'EN_COURS' | 'ENVOYE' | 'ECHEC';

/**
 * Pattern Outbox (cf. Partie IV Niveau 4.2).
 * Garantit la livraison vers SAP et autres systemes externes meme en cas de panne.
 */
@Entity({ name: 'aud_outbox' })
export class Outbox {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'type_message', type: 'nvarchar', length: 50 })
  typeMessage!: string;

  @Column({ type: 'nvarchar', length: 'MAX' })
  payload!: string;

  @Column({ type: 'nvarchar', length: 20, default: 'EN_ATTENTE' })
  statut!: OutboxStatut;

  @Column({ name: 'nb_tentatives', type: 'int', default: 0 })
  nbTentatives!: number;

  @Column({ name: 'prochaine_tentative', type: 'datetime2', precision: 3, nullable: true })
  prochaineTentative?: Date | null;

  @Column({ name: 'derniere_erreur', type: 'nvarchar', length: 'MAX', nullable: true })
  derniereErreur?: string | null;

  @Column({ name: 'cle_idempotence_externe', type: 'nvarchar', length: 100, nullable: true })
  cleIdempotenceExterne?: string | null;

  @CreateDateColumn({ name: 'date_creation', type: 'datetime2', precision: 3 })
  dateCreation!: Date;

  @Column({ name: 'date_traitement', type: 'datetime2', precision: 3, nullable: true })
  dateTraitement?: Date | null;
}
