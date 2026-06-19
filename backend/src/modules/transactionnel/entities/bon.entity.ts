import { Entity, Column } from 'typeorm';
import { decimalToString } from '@common/transformers/decimal.transformer';
import { ApiProperty } from '@nestjs/swagger';
import { AuditableEntity } from '@common/entities/base.entity';

export type BonStatut = 'CREE' | 'VALIDE' | 'DECAISSE' | 'COMPTABILISE' | 'ANNULE' | 'REFUSE';
export type FrequenceRecurrence = 'MENSUEL' | 'TRIMESTRIEL' | 'SEMESTRIEL' | 'ANNUEL';
export type StatutExtension = 'NON' | 'EN_ATTENTE' | 'APPROUVEE' | 'REFUSEE';
export type ExtensionMode = 'DECOUVERT' | 'RECHARGE';

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
  @Column({ name: 'montant_total', type: 'decimal', precision: 19, scale: 4, transformer: decimalToString, default: 0 })
  montantTotal!: string;

  @ApiProperty({ default: false, description: 'Le demandeur a sollicité une extension de budget' })
  @Column({ name: 'demande_extension', type: 'bit', default: false })
  demandeExtension!: boolean;

  @ApiProperty({ required: false, description: 'Justification optionnelle de la demande d\'extension' })
  @Column({ name: 'description_extension', type: 'nvarchar', length: 500, nullable: true })
  descriptionExtension?: string | null;

  @ApiProperty({ description: 'Statut du circuit d\'extension : NON / EN_ATTENTE / APPROUVEE / REFUSEE' })
  @Column({ name: 'statut_extension', type: 'nvarchar', length: 20, default: 'NON' })
  statutExtension!: StatutExtension;

  @ApiProperty({ required: false, description: 'Mode choisi à l\'approbation : DECOUVERT | RECHARGE' })
  @Column({ name: 'extension_mode', type: 'nvarchar', length: 20, nullable: true })
  extensionMode?: ExtensionMode | null;

  @ApiProperty({ required: false })
  @Column({ name: 'extension_decide_par_id', type: 'bigint', nullable: true })
  extensionDecideParId?: string | null;

  @ApiProperty({ required: false })
  @Column({ name: 'extension_date_decision', type: 'datetime2', precision: 3, nullable: true })
  extensionDateDecision?: Date | null;

  @ApiProperty({ required: false })
  @Column({ name: 'extension_commentaire', type: 'nvarchar', length: 500, nullable: true })
  extensionCommentaire?: string | null;

  @ApiProperty({ required: false, description: 'Personne qui se présentera à la caisse pour le retrait (texte libre, optionnel). Saisi à la création et/ou à la validation.' })
  @Column({ name: 'porteur', type: 'nvarchar', length: 255, nullable: true })
  porteur?: string | null;
}
