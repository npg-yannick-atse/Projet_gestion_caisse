import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';
import { FrequenceRecurrence } from '@modules/transactionnel/entities/bon.entity';

@Entity({ name: 'aud_planification_recurrence' })
export class PlanificationRecurrence {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'bon_id', type: 'bigint' })
  bonId!: string;

  @Column({ type: 'nvarchar', length: 20 })
  frequence!: FrequenceRecurrence;

  @Column({ name: 'derniere_execution', type: 'datetime2', precision: 3, nullable: true })
  derniereExecution?: Date | null;

  @Column({ name: 'prochaine_execution', type: 'datetime2', precision: 3 })
  prochaineExecution!: Date;

  @Column({ name: 'est_actif', type: 'bit', default: true })
  estActif!: boolean;

  @Column({ name: 'nb_renouvellements_effectues', type: 'int', default: 0 })
  nbRenouvellementsEffectues!: number;

  @CreateDateColumn({ name: 'created_at', type: 'datetime2', precision: 3 })
  createdAt!: Date;
}
