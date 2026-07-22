import { Entity, Column } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { decimalToString } from '@common/transformers/decimal.transformer';
import { AuditableEntity } from '@common/entities/base.entity';

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

  @ApiProperty({ default: true })
  @Column({ name: 'est_actif', type: 'bit', default: true })
  estActif!: boolean;
}
