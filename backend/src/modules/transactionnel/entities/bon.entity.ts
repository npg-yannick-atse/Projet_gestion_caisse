import { Entity, Column } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { AuditableEntity } from '@common/entities/base.entity';

export type BonStatut = 'CREE' | 'VALIDE' | 'DECAISSE' | 'COMPTABILISE' | 'ANNULE' | 'REFUSE';
export type FrequenceRecurrence = 'MENSUEL' | 'TRIMESTRIEL' | 'SEMESTRIEL' | 'ANNUEL';

/**
 * trx_bon = enveloppe legere.
 * Les donnees metier (partenaire, BL, montants, devise...) vivent sur les sous-bons.
 * Cf. MCD v2 - design "Bon = enveloppe, Sous-bon = cœur metier".
 */
@Entity({ name: 'trx_bon' })
export class Bon extends AuditableEntity {
  @ApiProperty()
  @Column({ type: 'uniqueidentifier', generated: 'uuid' })
  uuid!: string;

  @ApiProperty()
  @Column({ type: 'nvarchar', length: 50, unique: true })
  numero!: string;

  @Column({ name: 'demandeur_id', type: 'bigint' })
  demandeurId!: string;

  @Column({ name: 'cree_par_interim_id', type: 'bigint', nullable: true })
  creeParInterimId?: string | null;

  @Column({ name: 'type_bon_id', type: 'bigint' })
  typeBonId!: string;

  @ApiProperty({ enum: ['CREE', 'VALIDE', 'DECAISSE', 'COMPTABILISE', 'ANNULE', 'REFUSE'] })
  @Column({ type: 'nvarchar', length: 20, default: 'CREE' })
  statut!: BonStatut;

  @ApiProperty({ default: false })
  @Column({ name: 'est_recurrent', type: 'bit', default: false })
  estRecurrent!: boolean;

  @Column({ name: 'frequence_recurrence', type: 'nvarchar', length: 20, nullable: true })
  frequenceRecurrence?: FrequenceRecurrence | null;

  @Column({ name: 'bon_parent_id', type: 'bigint', nullable: true })
  bonParentId?: string | null;

  @ApiProperty({ description: 'SUM des sous-bons (snapshot, jamais source de verite)' })
  @Column({ name: 'montant_total', type: 'decimal', precision: 19, scale: 4, default: 0 })
  montantTotal!: string;
}
