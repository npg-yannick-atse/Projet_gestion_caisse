import { Entity, PrimaryColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Profil } from './profil.entity';
import { Permission } from './permission.entity';

@Entity({ name: 'sec_profil_permission' })
export class ProfilPermission {
  @PrimaryColumn({ name: 'profil_id', type: 'bigint' })
  profilId!: string;

  @PrimaryColumn({ name: 'permission_id', type: 'bigint' })
  permissionId!: string;

  @ManyToOne(() => Profil)
  @JoinColumn({ name: 'profil_id' })
  profil!: Profil;

  @ManyToOne(() => Permission)
  @JoinColumn({ name: 'permission_id' })
  permission!: Permission;
}
