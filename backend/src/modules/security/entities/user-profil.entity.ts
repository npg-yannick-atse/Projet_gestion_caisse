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

  @Column({ name: 'attribue_par_id', type: 'bigint', nullable: true })
  attribueParId?: string | null;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @ManyToOne(() => Profil)
  @JoinColumn({ name: 'profil_id' })
  profil!: Profil;
}
