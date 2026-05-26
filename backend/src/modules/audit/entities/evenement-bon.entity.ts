import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

export type TypeEvenementBon =
  | 'CREE'
  | 'MODIFIE'
  | 'VALIDE'
  | 'SIGNE'
  | 'IMPRIME'
  | 'DECAISSE'
  | 'ANNULE'
  | 'REFUSE';

@Entity({ name: 'aud_evenement_bon' })
export class EvenementBon {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'bon_id', type: 'bigint', nullable: true })
  bonId?: string | null;

  @Column({ name: 'sous_bon_id', type: 'bigint', nullable: true })
  sousBonId?: string | null;

  @Column({ name: 'type_evenement', type: 'nvarchar', length: 30 })
  typeEvenement!: TypeEvenementBon;

  @Column({ name: 'acteur_id', type: 'bigint' })
  acteurId!: string;

  @Column({ name: 'acteur_interim_id', type: 'bigint', nullable: true })
  acteurInterimId?: string | null;

  @Column({ type: 'nvarchar', length: 'MAX', nullable: true })
  payload?: string | null;

  @CreateDateColumn({ name: 'date_evenement', type: 'datetime2', precision: 3 })
  dateEvenement!: Date;

  @Column({ name: 'adresse_ip', type: 'nvarchar', length: 45, nullable: true })
  adresseIp?: string | null;
}
