import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

/** Jeton de notification push (Expo) d'un appareil rattaché à un utilisateur. */
@Entity({ name: 'sec_push_token' })
@Index('UX_sec_push_token_token', ['token'], { unique: true })
export class PushToken {
  @ApiProperty()
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @ApiProperty()
  @Column({ name: 'user_id', type: 'bigint' })
  userId!: string;

  @ApiProperty()
  @Column({ type: 'nvarchar', length: 255 })
  token!: string;

  @ApiProperty({ required: false })
  @Column({ type: 'nvarchar', length: 20, nullable: true })
  platform?: string | null;

  @ApiProperty()
  @CreateDateColumn({ name: 'created_at', type: 'datetime2', precision: 3 })
  createdAt!: Date;

  @ApiProperty({ required: false })
  @Column({ name: 'updated_at', type: 'datetime2', precision: 3, nullable: true })
  updatedAt?: Date | null;
}
