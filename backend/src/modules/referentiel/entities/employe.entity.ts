import { Entity, Column } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { decimalToString } from '@common/transformers/decimal.transformer';
import { AuditableEntity } from '@common/entities/base.entity';

/** Mode de règlement d'un employé. */
export type ModeReglement = 'ESPECES' | 'VIREMENT';

@Entity({ name: 'ref_employe' })
export class Employe extends AuditableEntity {
  @ApiProperty()
  @Column({ type: 'nvarchar', length: 50, unique: true })
  matricule!: string;

  @ApiProperty()
  @Column({ type: 'nvarchar', length: 150 })
  nom!: string;

  @ApiProperty()
  @Column({ type: 'nvarchar', length: 200 })
  prenoms!: string;

  @ApiProperty({ required: false, description: 'Direction de rattachement (sec_direction)' })
  @Column({ name: 'direction_id', type: 'bigint', nullable: true })
  directionId?: string | null;

  @ApiProperty({
    required: false,
    description: "Salaire (DECIMAL(19,4) en string). Retiré de la réponse si l'appelant n'a pas EMPLOYE_VOIR_SALAIRE.",
  })
  @Column({ type: 'decimal', precision: 19, scale: 4, transformer: decimalToString, nullable: true })
  salaire?: string | null;

  /* ------------------------------------------------------- Paiement -- */

  @ApiProperty({ enum: ['ESPECES', 'VIREMENT'], description: 'Mode de règlement de l’employé' })
  @Column({ name: 'mode_reglement', type: 'nvarchar', length: 20, default: 'ESPECES' })
  modeReglement!: ModeReglement;

  @ApiProperty({ required: false, description: 'Banque (mode VIREMENT)' })
  @Column({ type: 'nvarchar', length: 150, nullable: true })
  banque?: string | null;

  @ApiProperty({ required: false, description: 'RIB / n° de compte (mode VIREMENT)' })
  @Column({ type: 'nvarchar', length: 50, nullable: true })
  rib?: string | null;

  @ApiProperty({ required: false, description: 'Portefeuille source par défaut (fin_portefeuille) des avances/crédits' })
  @Column({ name: 'portefeuille_source_id', type: 'bigint', nullable: true })
  portefeuilleSourceId?: string | null;

  @ApiProperty({ default: true })
  @Column({ name: 'est_actif', type: 'bit', default: true })
  estActif!: boolean;
}
