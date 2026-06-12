import { Controller, ForbiddenException, Get, Query, UseGuards } from '@nestjs/common';
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
  @ApiOperation({ summary: "Journal d'audit (Super Admin uniquement)" })
  async findAll(
    @CurrentUser() user: JwtPayload,
    @Query('userId') userId?: string,
    @Query('action') action?: string,
    @Query('entite') entite?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    const codes = await this.authz.getUserRoleCodes(user.sub);
    if (!codes.has('SUPER_ADMIN')) {
      throw new ForbiddenException("Le journal d'audit est réservé au Super Admin.");
    }
    return this.audit.findAll({ userId, action, entite, dateFrom, dateTo });
  }
}
