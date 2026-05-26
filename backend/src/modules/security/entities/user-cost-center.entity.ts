import { Entity, Column, PrimaryColumn, CreateDateColumn } from 'typeorm';

@Entity({ name: 'sec_user_cost_center' })
export class UserCostCenter {
  @PrimaryColumn({ name: 'user_id', type: 'bigint' })
  userId!: string;

  @PrimaryColumn({ name: 'cost_center_id', type: 'bigint' })
  costCenterId!: string;

  @Column({ name: 'est_principal', type: 'bit', default: false })
  estPrincipal!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'datetime2', precision: 3 })
  createdAt!: Date;

  @Column({ name: 'created_by_id', type: 'bigint', nullable: true })
  createdById?: string | null;
}
