import { Entity, Column, PrimaryColumn, CreateDateColumn } from 'typeorm';

export type NiveauAcces = 'LECTURE' | 'ECRITURE' | 'ADMIN';

@Entity({ name: 'sec_user_caisse_access' })
export class UserCaisseAccess {
  @PrimaryColumn({ name: 'user_id', type: 'bigint' })
  userId!: string;

  @PrimaryColumn({ name: 'caisse_id', type: 'bigint' })
  caisseId!: string;

  @Column({ name: 'niveau_acces', type: 'nvarchar', length: 20 })
  niveauAcces!: NiveauAcces;

  @CreateDateColumn({ name: 'created_at', type: 'datetime2', precision: 3 })
  createdAt!: Date;

  @Column({ name: 'created_by_id', type: 'bigint', nullable: true })
  createdById?: string | null;
}
