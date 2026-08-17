import { Entity, Column } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { AuditableEntity } from '@common/entities/base.entity';

export type TypePartenaire = 'CLIENT' | 'FOURNISSEUR' | 'MIXTE';

@Entity({ name: 'ref_partenaire' })
export class Partenaire extends AuditableEntity {
  @ApiProperty()
  @Column({ type: 'uniqueidentifier', generated: 'uuid' })
  uuid!: string;

  @ApiProperty()
  @Column({ type: 'nvarchar', length: 50, unique: true })
  code!: string;

  @ApiProperty()
  @Column({ name: 'raison_sociale', type: 'nvarchar', length: 255 })
  raisonSociale!: string;

  @ApiProperty({ required: false })
  @Column({ type: 'nvarchar', length: 50, nullable: true })
  sigle?: string | null;

  @ApiProperty({ enum: ['CLIENT', 'FOURNISSEUR', 'MIXTE'] })
  @Column({ name: 'type_partenaire', type: 'nvarchar', length: 20 })
  typePartenaire!: TypePartenaire;

  @ApiProperty({ required: false })
  @Column({ name: 'numero_client', type: 'nvarchar', length: 50, nullable: true })
  numeroClient?: string | null;

  @ApiProperty({ required: false, description: 'N° fournisseur SAP (LIFNR) — pour les partenaires fournisseurs' })
  @Column({ name: 'numero_fournisseur', type: 'nvarchar', length: 50, nullable: true })
  numeroFournisseur?: string | null;

  @ApiProperty({ required: false })
  @Column({ type: 'nvarchar', length: 500, nullable: true })
  adresse?: string | null;

  @ApiProperty({ required: false })
  @Column({ type: 'nvarchar', length: 30, nullable: true })
  telephone?: string | null;

  @ApiProperty({ required: false })
  @Column({ type: 'nvarchar', length: 200, nullable: true })
  email?: string | null;

  /**
   * Code ISO tel que SAP l'a donné (LFA1-LAND1 / KNA1-LAND1).
   *
   * Conservé en plus de `paysId` : c'est la trace de la source. Si le
   * référentiel ignore un jour un code, on saura encore ce que SAP disait.
   */
  @ApiProperty({ required: false, description: 'Code ISO du pays, tel que reçu de SAP' })
  @Column({ type: 'nvarchar', length: 100, nullable: true })
  pays?: string | null;

  @ApiProperty({ required: false, description: 'Pays du référentiel (migration 0071)' })
  @Column({ name: 'pays_id', type: 'bigint', nullable: true })
  paysId?: string | null;

  /**
   * Nom du pays, résolu par le SERVEUR — un écran qui affiche « GH » n'affiche
   * rien à quelqu'un qui cherche « Ghana ». Non persisté.
   */
  @ApiProperty({ required: false, description: 'Libellé du pays, résolu côté serveur' })
  paysLibelle?: string | null;

  @ApiProperty({ required: false })
  @Column({ type: 'nvarchar', length: 100, nullable: true })
  ville?: string | null;

  @ApiProperty({ default: true })
  @Column({ name: 'est_actif', type: 'bit', default: true })
  estActif!: boolean;
}
