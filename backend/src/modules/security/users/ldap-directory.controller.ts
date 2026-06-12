import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { LdapDirectoryService } from './ldap-directory.service';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';

@ApiTags('Security / LDAP')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('ldap')
export class LdapDirectoryController {
  constructor(private readonly ldap: LdapDirectoryService) {}

  @Get('users')
  @ApiOperation({ summary: 'Lister les utilisateurs de l\'annuaire LDAP NPG (normalisés)' })
  listUsers() {
    return this.ldap.listUsers();
  }
}
