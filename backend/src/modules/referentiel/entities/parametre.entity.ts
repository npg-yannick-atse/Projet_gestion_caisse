import { Entity, Column, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

/** Réglage global clé/valeur, modifiable via le back-office. */
@Entity({ name: 'app_parametre' })
export class Parametre {
  @ApiProperty()
  @PrimaryColumn({ type: 'nvarchar', length: 100 })
  cle!: string;

  @ApiProperty({ required: false })
  @Column({ type: 'nvarchar', length: 400, nullable: true })
  valeur?: string | null;

  @ApiProperty({ required: false })
  @Column({ type: 'nvarchar', length: 200, nullable: true })
  libelle?: string | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime2', precision: 3 })
  updatedAt!: Date;

  @Column({ name: 'updated_by_id', type: 'bigint', nullable: true })
  updatedById?: string | null;
}
