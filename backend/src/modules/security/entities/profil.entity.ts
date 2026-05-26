import { Entity, Column } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { AuditableEntity } from '@common/entities/base.entity';

export type ProfilCategorie = 'VALIDATEUR' | 'DEMANDEUR' | 'CAISSIER' | 'INTERIM';

@Entity({ name: 'sec_profil' })
export class Profil extends AuditableEntity {
  @ApiProperty()
  @Column({ type: 'nvarchar', length: 50, unique: true })
  code!: string;

  @ApiProperty()
  @Column({ type: 'nvarchar', length: 200 })
  libelle!: string;

  @ApiProperty({ required: false })
  @Column({ type: 'nvarchar', length: 'MAX', nullable: true })
  description?: string | null;

  @ApiProperty({ enum: ['VALIDATEUR', 'DEMANDEUR', 'CAISSIER', 'INTERIM'] })
  @Column({ type: 'nvarchar', length: 20 })
  categorie!: ProfilCategorie;

  @ApiProperty({ default: true })
  @Column({ name: 'est_actif', type: 'bit', default: true })
  estActif!: boolean;
}
