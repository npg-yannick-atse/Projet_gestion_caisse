import { ApiProperty } from '@nestjs/swagger';
import {
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  VersionColumn,
  Column,
} from 'typeorm';

/**
 * Colonnes d'audit standard appliquees aux tables metier.
 * Cf. annexe Partie IV, section 5.2 du dossier de conception.
 */
export abstract class AuditableEntity {
  @ApiProperty({ example: 1 })
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @ApiProperty()
  @CreateDateColumn({ name: 'created_at', type: 'datetime2', precision: 3 })
  createdAt!: Date;

  @ApiProperty({ required: false })
  @Column({ name: 'created_by_id', type: 'bigint', nullable: true })
  createdById?: string | null;

  @ApiProperty({ required: false })
  @UpdateDateColumn({ name: 'updated_at', type: 'datetime2', precision: 3, nullable: true })
  updatedAt?: Date | null;

  @ApiProperty({ required: false })
  @Column({ name: 'updated_by_id', type: 'bigint', nullable: true })
  updatedById?: string | null;

  @ApiProperty({ required: false })
  @DeleteDateColumn({ name: 'deleted_at', type: 'datetime2', precision: 3, nullable: true })
  deletedAt?: Date | null;

  @ApiProperty({ required: false })
  @Column({ name: 'deleted_by_id', type: 'bigint', nullable: true })
  deletedById?: string | null;

  @ApiProperty({ example: 1 })
  @VersionColumn({ type: 'int', default: 1 })
  version!: number;
}
