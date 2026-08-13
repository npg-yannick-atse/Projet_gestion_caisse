import { Entity, Column, PrimaryColumn, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { User } from './user.entity';
import { Profil } from './profil.entity';

@Entity({ name: 'sec_user_profil' })
export class UserProfil {
  @PrimaryColumn({ name: 'user_id', type: 'bigint' })
  userId!: string;

  @PrimaryColumn({ name: 'profil_id', type: 'bigint' })
  profilId!: string;

  @CreateDateColumn({ name: 'date_attribution', type: 'datetime2', precision: 3 })
  dateAttribution!: Date;

  /**
   * Période de validité (migration 0061). `date_attribution` dit quand le profil
   * a été donné ; ces deux bornes disent à partir de quand il agit et jusqu'à
   * quand. Un profil prêté le temps d'un remplacement s'éteint donc tout seul.
   *
   * null / null = permanent — c'est le comportement d'avant, et celui de toutes
   * les lignes existantes.
   */
  @Column({ name: 'date_debut', type: 'datetime2', precision: 3, nullable: true })
  dateDebut?: Date | null;

  @Column({ name: 'date_fin', type: 'datetime2', precision: 3, nullable: true })
  dateFin?: Date | null;

  @Column({ name: 'attribue_par_id', type: 'bigint', nullable: true })
  attribueParId?: string | null;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @ManyToOne(() => Profil)
  @JoinColumn({ name: 'profil_id' })
  profil!: Profil;
}
