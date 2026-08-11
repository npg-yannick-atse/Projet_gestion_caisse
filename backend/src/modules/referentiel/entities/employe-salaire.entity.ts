import { Entity, Column } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { AuditableEntity } from '@common/entities/base.entity';
import { decimalToString } from '@common/transformers/decimal.transformer';

/**
 * Salaire d'un employé sur une PÉRIODE.
 *
 * Le salaire était une simple colonne, écrasée à chaque augmentation : aucun
 * historique, et le « reste dû » des mois passés se recalculait au montant
 * courant. Il suit désormais le modèle des bénéfices — une succession de
 * périodes — si bien qu'une augmentation clôt la période en cours et en ouvre
 * une nouvelle, sans jamais réécrire le passé.
 */
@Entity({ name: 'ref_employe_salaire' })
export class EmployeSalaire extends AuditableEntity {
  @ApiProperty()
  @Column({ name: 'employe_id', type: 'bigint' })
  employeId!: string;

  @ApiProperty()
  @Column({ type: 'decimal', precision: 19, scale: 4, transformer: decimalToString })
  montant!: string;

  @ApiProperty({ description: 'Premier jour de validité.' })
  @Column({ name: 'date_debut', type: 'date' })
  dateDebut!: string;

  @ApiProperty({ required: false, description: 'Dernier jour de validité. null = salaire en vigueur.' })
  @Column({ name: 'date_fin', type: 'date', nullable: true })
  dateFin?: string | null;

  @ApiProperty({ required: false, description: 'Augmentation, réduction, régularisation…' })
  @Column({ type: 'nvarchar', length: 200, nullable: true })
  motif?: string | null;
}
