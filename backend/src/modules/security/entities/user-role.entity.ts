import { Entity, Column, PrimaryColumn, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { User } from './user.entity';
import { Role } from './role.entity';

@Entity({ name: 'sec_user_role' })
export class UserRole {
  @ApiProperty()
  @PrimaryColumn({ name: 'user_id', type: 'bigint' })
  userId!: string;

  @ApiProperty()
  @PrimaryColumn({ name: 'role_id', type: 'bigint' })
  roleId!: string;

  @CreateDateColumn({ name: 'date_attribution', type: 'datetime2', precision: 3 })
  dateAttribution!: Date;

  @Column({ name: 'attribue_par_id', type: 'bigint', nullable: true })
  attribueParId?: string | null;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @ManyToOne(() => Role)
  @JoinColumn({ name: 'role_id' })
  role!: Role;
}
