import { Entity, Column } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { decimalToString } from '@common/transformers/decimal.transformer';
import { AuditableEntity } from '@common/entities/base.entity';

/** Façon dont le montant d'un bénéfice de ce type est déterminé. */
export type ModeMontantBenefice = 'SAISI' | 'FIXE' | 'POURCENTAGE_SALAIRE';

@Entity({ name: 'ref_type_benefice' })
export class TypeBenefice extends AuditableEntity {
  @ApiProperty()
  @Column({ type: 'nvarchar', length: 50, unique: true })
  code!: string;

  @ApiProperty()
  @Column({ type: 'nvarchar', length: 200 })
  libelle!: string;

  @ApiProperty({ default: true })
  @Column({ name: 'est_actif', type: 'bit', default: true })
  estActif!: boolean;

  /* ------------------------------------------------ Mode d'attribution -- */

  @ApiProperty({
    enum: ['SAISI', 'FIXE', 'POURCENTAGE_SALAIRE'],
    description: 'Comment le montant est déterminé à l’attribution',
  })
  @Column({ name: 'mode_montant', type: 'nvarchar', length: 20, default: 'SAISI' })
  modeMontant!: ModeMontantBenefice;

  @ApiProperty({ required: false, description: 'Montant imposé (mode FIXE) — DECIMAL(19,4) en string' })
  @Column({ name: 'montant_fixe', type: 'decimal', precision: 19, scale: 4, nullable: true, transformer: decimalToString })
  montantFixe?: string | null;

  @ApiProperty({ required: false, description: '% du salaire appliqué (mode POURCENTAGE_SALAIRE)' })
  @Column({ name: 'pourcentage_salaire', type: 'decimal', precision: 5, scale: 2, nullable: true, transformer: decimalToString })
  pourcentageSalaire?: string | null;

  @ApiProperty({ required: false, description: 'Plafond en % du salaire (tous modes)' })
  @Column({
    name: 'plafond_pourcentage_salaire',
    type: 'decimal',
    precision: 5,
    scale: 2,
    nullable: true,
    transformer: decimalToString,
  })
  plafondPourcentageSalaire?: string | null;

  @ApiProperty({ required: false, description: 'Attribution autorisée seulement à partir de ce jour du mois' })
  @Column({ name: 'jour_min_mois', type: 'int', nullable: true })
  jourMinMois?: number | null;

  @ApiProperty({ default: true, description: 'Le bénéfice a-t-il une période (dates début/fin)' })
  @Column({ name: 'requiert_periode', type: 'bit', default: true })
  requiertPeriode!: boolean;

  @ApiProperty({ default: false, description: 'Bénéfice récurrent (vs ponctuel)' })
  @Column({ name: 'recurrent', type: 'bit', default: false })
  recurrent!: boolean;
}
