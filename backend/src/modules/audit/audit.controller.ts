import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '@modules/auth/decorators/current-user.decorator';
import { AuthorizationService } from '@modules/security/authorization.service';

@ApiTags('Audit')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('audit')
export class AuditController {
  constructor(
    private readonly audit: AuditService,
    private readonly authz: AuthorizationService,
  ) {}

  @Get()
  @ApiOperation({ summary: "Journal d'audit (permission AUDIT_VOIR — Super Admin par défaut)" })
  async findAll(
    @CurrentUser() user: JwtPayload,
    @Query('userId') userId?: string,
    @Query('action') action?: string,
    @Query('entite') entite?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: string,
  ) {
    // Strict (sans bypass admin) : le journal était réservé au Super Admin ; un
    // administrateur ordinaire ne doit pas y accéder du seul fait de son rôle.
    // AUDIT_VOIR n'est attribuée qu'à SUPER_ADMIN (migration 0040), mais peut
    // désormais être déléguée à un auditeur sans lui donner le rôle entier.
    await this.authz.assertPermissionStrict(
      user.sub,
      'AUDIT_VOIR',
      "consulter le journal d'audit",
    );
    return this.audit.findAll({
      userId,
      action,
      entite,
      dateFrom,
      dateTo,
      sortBy,
      sortDir: sortDir === 'asc' ? 'asc' : sortDir === 'desc' ? 'desc' : undefined,
    });
  }
}
