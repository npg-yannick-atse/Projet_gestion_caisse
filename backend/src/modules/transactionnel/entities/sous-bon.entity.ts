import { Entity, Column } from 'typeorm';
import { decimalToString } from '@common/transformers/decimal.transformer';
import { ApiProperty } from '@nestjs/swagger';
import { AuditableEntity } from '@common/entities/base.entity';
import { BonStatut } from './bon.entity';

/**
 * trx_sous_bon = cœur metier.
 * Porte les donnees fonctionnelles : partenaire, num client/BL/manutention,
 * nature comptable, montant, devise, caisse, portefeuille.
 * Statut independant du bon parent ; traitement entier (jamais partiel).
 */
@Entity({ name: 'trx_sous_bon' })
export class SousBon extends AuditableEntity {
  @ApiProperty()
  @Column({ type: 'uniqueidentifier', generated: 'uuid' })
  uuid!: string;

  @Column({ name: 'bon_id', type: 'bigint' })
  bonId!: string;

  @ApiProperty()
  @Column({ name: 'numero_sous_bon', type: 'int' })
  numeroSousBon!: number;

  @ApiProperty()
  @Column({ type: 'nvarchar', length: 255 })
  libelle!: string;

  @ApiProperty({ required: false })
  @Column({ type: 'nvarchar', length: 'MAX', nullable: true })
  description?: string | null;

  @ApiProperty()
  @Column({ type: 'decimal', precision: 19, scale: 4, transformer: decimalToString })
  montant!: string;

  @ApiProperty({ required: false })
  @Column({ name: 'montant_a_payer_client', type: 'decimal', precision: 19, scale: 4, transformer: decimalToString, nullable: true })
  montantAPayerClient?: string | null;

  @ApiProperty({ required: false, description: 'Partenaire facultatif — peut être nul pour les opérations internes' })
  @Column({ name: 'partenaire_id', type: 'bigint', nullable: true })
  partenaireId?: string | null;

  @ApiProperty({ required: false, description: 'Obligatoire si le type de bon est RESTITUTION_CLIENT' })
  @Column({ name: 'numero_client', type: 'nvarchar', length: 50, nullable: true })
  numeroClient?: string | null;

  @ApiProperty()
  @Column({ name: 'numero_bl', type: 'nvarchar', length: 100 })
  numeroBl!: string;

  @ApiProperty()
  @Column({ name: 'code_manutention', type: 'nvarchar', length: 100 })
  codeManutention!: string;

  @Column({ name: 'nature_comptable_id', type: 'bigint', nullable: true })
  natureComptableId?: string | null;

  @Column({ name: 'nature_operation_id', type: 'bigint', nullable: true })
  natureOperationId?: string | null;

  @Column({ name: 'cost_center_id', type: 'bigint' })
  costCenterId!: string;

  @Column({ name: 'caisse_id', type: 'bigint' })
  caisseId!: string;

  @Column({ name: 'portefeuille_id', type: 'bigint' })
  portefeuilleId!: string;

  @Column({ name: 'devise_id', type: 'bigint' })
  deviseId!: string;

  @ApiProperty({ enum: ['CREE', 'VALIDE', 'DECAISSE', 'COMPTABILISE', 'ANNULE', 'REFUSE'] })
  @Column({ type: 'nvarchar', length: 20, default: 'CREE' })
  statut!: BonStatut;

  @Column({ name: 'date_decaissement', type: 'datetime2', precision: 3, nullable: true })
  dateDecaissement?: Date | null;

  @ApiProperty({ default: false })
  @Column({ name: 'est_imprime', type: 'bit', default: false })
  estImprime!: boolean;

  @ApiProperty({ default: false })
  @Column({ name: 'est_signe', type: 'bit', default: false })
  estSigne!: boolean;
}
