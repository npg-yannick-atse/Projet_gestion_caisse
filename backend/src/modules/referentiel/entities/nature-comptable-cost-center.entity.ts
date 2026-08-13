import { Entity, Column, PrimaryColumn, CreateDateColumn } from 'typeorm';

/**
 * Liaison MULTIPLE nature comptable ↔ centre de coût (migration 0065).
 *
 * Une même nature sert à plusieurs services — un carburant est imputé à la
 * logistique comme à la direction générale — et un centre de coût emploie
 * plusieurs natures. La relation se lit donc dans les deux sens, et aucun des
 * deux côtés n'est propriétaire de l'autre.
 */
@Entity({ name: 'ref_nature_comptable_cost_center' })
export class NatureComptableCostCenter {
  @PrimaryColumn({ name: 'nature_comptable_id', type: 'bigint' })
  natureComptableId!: string;

  @PrimaryColumn({ name: 'cost_center_id', type: 'bigint' })
  costCenterId!: string;

  @CreateDateColumn({ name: 'created_at', type: 'datetime2', precision: 3 })
  createdAt!: Date;

  @Column({ name: 'created_by_id', type: 'bigint', nullable: true })
  createdById?: string | null;
}
