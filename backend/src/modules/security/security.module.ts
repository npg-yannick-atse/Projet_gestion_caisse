import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Direction } from './entities/direction.entity';
import { User } from './entities/user.entity';
import { Role } from './entities/role.entity';
import { Permission } from './entities/permission.entity';
import { Profil } from './entities/profil.entity';
import { UserRole } from './entities/user-role.entity';
import { RolePermission } from './entities/role-permission.entity';
import { UserProfil } from './entities/user-profil.entity';
import { ProfilPermission } from './entities/profil-permission.entity';
import { UserCaisseAccess } from './entities/user-caisse-access.entity';
import { UserCostCenter } from './entities/user-cost-center.entity';
import { UserPermissionExtra } from './entities/user-permission-extra.entity';
import { Interim } from './entities/interim.entity';
import { UsersService } from './users/users.service';
import { UsersController } from './users/users.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Direction,
      User,
      Role,
      Permission,
      Profil,
      UserRole,
      RolePermission,
      UserProfil,
      ProfilPermission,
      UserCaisseAccess,
      UserCostCenter,
      UserPermissionExtra,
      Interim,
    ]),
  ],
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService, TypeOrmModule],
})
export class SecurityModule {}
