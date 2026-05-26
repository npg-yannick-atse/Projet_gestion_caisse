import { Entity, Column, PrimaryColumn, CreateDateColumn } from 'typeorm';

@Entity({ name: 'ref_partenaire_nature_comptable' })
export class PartenaireNatureComptable {
  @PrimaryColumn({ name: 'partenaire_id', type: 'bigint' })
  partenaireId!: string;

  @PrimaryColumn({ name: 'nature_comptable_id', type: 'bigint' })
  natureComptableId!: string;

  @Column({ name: 'est_par_defaut', type: 'bit', default: false })
  estParDefaut!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'datetime2', precision: 3 })
  createdAt!: Date;

  @Column({ name: 'created_by_id', type: 'bigint', nullable: true })
  createdById?: string | null;
}
