import { Entity, PrimaryColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Role } from './role.entity';
import { Permission } from './permission.entity';

@Entity({ name: 'sec_role_permission' })
export class RolePermission {
  @PrimaryColumn({ name: 'role_id', type: 'bigint' })
  roleId!: string;

  @PrimaryColumn({ name: 'permission_id', type: 'bigint' })
  permissionId!: string;

  @ManyToOne(() => Role)
  @JoinColumn({ name: 'role_id' })
  role!: Role;

  @ManyToOne(() => Permission)
  @JoinColumn({ name: 'permission_id' })
  permission!: Permission;
}
