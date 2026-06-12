import { Entity, Column } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { AuditableEntity } from '@common/entities/base.entity';

export const ROLE_CODES = [
  'SUPER_ADMIN',
  'ADMINISTRATEUR',
  'VALIDATEUR',
  'DEMANDEUR',
  'CAISSIER',
  'GESTIONNAIRE_PORTEFEUILLE',
  'DAF',
] as const;
export type RoleCode = (typeof ROLE_CODES)[number];

@Entity({ name: 'sec_role' })
export class Role extends AuditableEntity {
  @ApiProperty()
  @Column({ type: 'nvarchar', length: 50, unique: true })
  code!: RoleCode;

  @ApiProperty()
  @Column({ type: 'nvarchar', length: 200 })
  libelle!: string;

  @ApiProperty({ required: false })
  @Column({ type: 'nvarchar', length: 'MAX', nullable: true })
  description?: string | null;

  @ApiProperty({ default: false })
  @Column({ name: 'est_systeme', type: 'bit', default: false })
  estSysteme!: boolean;

  @ApiProperty({ default: true })
  @Column({ name: 'est_actif', type: 'bit', default: true })
  estActif!: boolean;
}
