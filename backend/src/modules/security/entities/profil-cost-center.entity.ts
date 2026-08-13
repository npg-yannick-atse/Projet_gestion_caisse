import { Entity, Column, PrimaryColumn, CreateDateColumn } from 'typeorm';

/** Périmètre porté par un PROFIL, et non par une personne (migration 0067). */
@Entity({ name: 'sec_profil_cost_center' })
export class ProfilCostCenter {
  @PrimaryColumn({ name: 'profil_id', type: 'bigint' })
  profilId!: string;

  @PrimaryColumn({ name: 'cost_center_id', type: 'bigint' })
  costCenterId!: string;

  @CreateDateColumn({ name: 'created_at', type: 'datetime2', precision: 3 })
  createdAt!: Date;

  @Column({ name: 'created_by_id', type: 'bigint', nullable: true })
  createdById?: string | null;
}
