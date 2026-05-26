import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

@Entity({ name: 'fin_devise' })
export class Devise {
  @ApiProperty()
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @ApiProperty()
  @Column({ type: 'nvarchar', length: 10, unique: true })
  code!: string;

  @ApiProperty()
  @Column({ type: 'nvarchar', length: 100 })
  libelle!: string;

  @ApiProperty({ required: false })
  @Column({ type: 'nvarchar', length: 10, nullable: true })
  symbole?: string | null;

  @ApiProperty({ default: 2 })
  @Column({ name: 'nb_decimales', type: 'int', default: 2 })
  nbDecimales!: number;

  @ApiProperty({ default: true })
  @Column({ name: 'est_actif', type: 'bit', default: true })
  estActif!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'datetime2', precision: 3 })
  createdAt!: Date;
}
