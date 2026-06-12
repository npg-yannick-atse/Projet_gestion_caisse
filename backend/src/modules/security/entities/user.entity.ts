import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import { AuditableEntity } from '@common/entities/base.entity';
import { Direction } from './direction.entity';

@Entity({ name: 'sec_user' })
export class User extends AuditableEntity {
  @ApiProperty()
  @Column({ type: 'uniqueidentifier', generated: 'uuid' })
  uuid!: string;

  @ApiProperty()
  @Column({ type: 'nvarchar', length: 50, unique: true })
  matricule!: string;

  @ApiProperty()
  @Column({ type: 'nvarchar', length: 100 })
  nom!: string;

  @ApiProperty()
  @Column({ type: 'nvarchar', length: 100 })
  prenom!: string;

  @ApiProperty()
  @Column({ type: 'nvarchar', length: 200, unique: true })
  email!: string;

  @ApiProperty({ required: false })
  @Column({ type: 'nvarchar', length: 30, nullable: true })
  telephone?: string | null;

  @Exclude()
  @Column({ name: 'mot_de_passe_hash', type: 'nvarchar', length: 255 })
  motDePasseHash!: string;

  @ApiProperty({ required: false })
  @Column({ name: 'direction_id', type: 'bigint', nullable: true })
  directionId?: string | null;

  @ApiProperty({ required: false })
  @Column({ name: 'cost_center_id', type: 'bigint', nullable: true })
  costCenterId?: string | null;

  @ApiProperty({ default: true })
  @Column({ name: 'est_actif', type: 'bit', default: true })
  estActif!: boolean;

  @ApiProperty({ default: true, description: "Autorise la connexion à l'application web" })
  @Column({ name: 'acces_web', type: 'bit', default: true })
  accesWeb!: boolean;

  @ApiProperty({ default: true, description: "Autorise la connexion à l'application mobile" })
  @Column({ name: 'acces_mobile', type: 'bit', default: true })
  accesMobile!: boolean;

  @ApiProperty({ required: false })
  @Column({ name: 'derniere_connexion', type: 'datetime2', precision: 3, nullable: true })
  derniereConnexion?: Date | null;

  @ManyToOne(() => Direction, { nullable: true })
  @JoinColumn({ name: 'direction_id' })
  direction?: Direction | null;
}
