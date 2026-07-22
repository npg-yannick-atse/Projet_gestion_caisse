import { Entity, Column } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { decimalToString } from '@common/transformers/decimal.transformer';
import { AuditableEntity } from '@common/entities/base.entity';

/**
 * Bénéfice accordé à un employé (ex. billet d'avion du 01 au 30).
 *
 * `estValide` est un interrupteur MANUEL, indépendant de dateDebut/dateFin :
 * un bénéfice reste valide tant qu'on ne l'a pas désactivé, même passée sa
 * période. Un employé ne peut avoir qu'UN SEUL bénéfice valide par type à la
 * fois — règle garantie en base par l'index unique filtré
 * UQ_ref_emp_benef_valide (WHERE est_valide = 1, migration 0016).
 * Les bénéfices désactivés restent en base à titre d'historique.
 */
@Entity({ name: 'ref_employe_benefice' })
export class EmployeBenefice extends AuditableEntity {
  @ApiProperty()
  @Column({ name: 'employe_id', type: 'bigint' })
  employeId!: string;

  @ApiProperty()
  @Column({ name: 'type_benefice_id', type: 'bigint' })
  typeBeneficeId!: string;

  @ApiProperty({ description: 'Montant du bénéfice (DECIMAL(19,4) en string)' })
  @Column({ type: 'decimal', precision: 19, scale: 4, transformer: decimalToString })
  montant!: string;

  @ApiProperty({ description: 'Début de la période de validité (AAAA-MM-JJ)' })
  @Column({ name: 'date_debut', type: 'date' })
  dateDebut!: string;

  @ApiProperty({ description: 'Fin de la période de validité (AAAA-MM-JJ)' })
  @Column({ name: 'date_fin', type: 'date' })
  dateFin!: string;

  @ApiProperty({ default: true, description: 'Interrupteur manuel : un seul bénéfice valide par type et par employé' })
  @Column({ name: 'est_valide', type: 'bit', default: true })
  estValide!: boolean;

  @ApiProperty({ required: false })
  @Column({ type: 'nvarchar', length: 'MAX', nullable: true })
  commentaire?: string | null;
}
