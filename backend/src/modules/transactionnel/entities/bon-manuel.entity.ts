import { Entity, Column, Index } from 'typeorm';
import { decimalToString } from '@common/transformers/decimal.transformer';
import { ApiProperty } from '@nestjs/swagger';
import { AuditableEntity } from '@common/entities/base.entity';

/**
 * Bon manuel : décaissement issu d'un carnet papier, hors circuit normal
 * (pas de demande → validation → impression). Créé directement « décaissé »
 * par le caissier, en gardant la traçabilité (donneur d'ordre + bénéficiaire).
 */
@Entity({ name: 'trx_bon_manuel' })
@Index('UX_trx_bon_manuel_carnet_numero', ['carnetId', 'numeroManuel'], { unique: true })
export class BonManuel extends AuditableEntity {
  @ApiProperty()
  @Column({ type: 'uniqueidentifier', generated: 'uuid' })
  uuid!: string;

  @ApiProperty({ description: 'Numéro système (auto), ex. BM-0001' })
  @Column({ type: 'nvarchar', length: 50, unique: true })
  numero!: string;

  @ApiProperty()
  @Column({ name: 'carnet_id', type: 'bigint' })
  carnetId!: string;

  @ApiProperty({ description: 'Numéro du bon dans le carnet papier (ex. 1023)' })
  @Column({ name: 'numero_manuel', type: 'int' })
  numeroManuel!: number;

  @ApiProperty()
  @Column({ name: 'caissier_id', type: 'bigint' })
  caissierId!: string;

  @ApiProperty()
  @Column({ name: 'caisse_id', type: 'bigint' })
  caisseId!: string;

  @ApiProperty()
  @Column({ name: 'portefeuille_id', type: 'bigint' })
  portefeuilleId!: string;

  @ApiProperty()
  @Column({ name: 'devise_id', type: 'bigint' })
  deviseId!: string;

  @ApiProperty()
  @Column({ type: 'decimal', precision: 19, scale: 4, transformer: decimalToString })
  montant!: string;

  // --- Mêmes informations qu'un bon normal (ligne unique) ---
  @ApiProperty()
  @Column({ name: 'type_bon_id', type: 'bigint', nullable: true })
  typeBonId!: string;

  @ApiProperty()
  @Column({ type: 'nvarchar', length: 255, nullable: true })
  libelle!: string;

  @ApiProperty({ required: false })
  @Column({ name: 'partenaire_id', type: 'bigint', nullable: true })
  partenaireId?: string | null;

  @ApiProperty()
  @Column({ name: 'numero_bl', type: 'nvarchar', length: 100, nullable: true })
  numeroBl!: string;

  @ApiProperty()
  @Column({ name: 'code_manutention', type: 'nvarchar', length: 100, nullable: true })
  codeManutention!: string;

  @ApiProperty()
  @Column({ name: 'cost_center_id', type: 'bigint', nullable: true })
  costCenterId!: string;

  @ApiProperty({ required: false })
  @Column({ name: 'numero_client', type: 'nvarchar', length: 50, nullable: true })
  numeroClient?: string | null;

  @ApiProperty({ required: false })
  @Column({ type: 'nvarchar', length: 500, nullable: true })
  description?: string | null;

  // --- Donneur d'ordre : utilisateur du système OU nom libre ---
  @ApiProperty({ required: false })
  @Column({ name: 'donneur_ordre_user_id', type: 'bigint', nullable: true })
  donneurOrdreUserId?: string | null;

  @ApiProperty({ required: false })
  @Column({ name: 'donneur_ordre_nom', type: 'nvarchar', length: 255, nullable: true })
  donneurOrdreNom?: string | null;

  // --- Bénéficiaire : celui qui a retiré l'argent ---
  @ApiProperty()
  @Column({ name: 'beneficiaire_nom', type: 'nvarchar', length: 255 })
  beneficiaireNom!: string;

  @ApiProperty({ required: false })
  @Column({ type: 'nvarchar', length: 500, nullable: true })
  motif?: string | null;

  @ApiProperty({ default: 'DECAISSE' })
  @Column({ type: 'nvarchar', length: 20, default: 'DECAISSE' })
  statut!: string;

  @ApiProperty()
  @Column({ name: 'date_decaissement', type: 'datetime2', precision: 3 })
  dateDecaissement!: Date;
}
