import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreditService } from './credit.service';
import { CreateCreditDto, UpdateCreditDto } from './dto/credit.dto';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '@modules/auth/decorators/current-user.decorator';
import { AuthorizationService } from '@modules/security/authorization.service';

@ApiTags('Financier / Crédits')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('credits')
export class CreditController {
  constructor(
    private readonly creditService: CreditService,
    private readonly authz: AuthorizationService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Lister les crédits (de sa direction ; tous pour un admin)' })
  list(@CurrentUser() user: JwtPayload) {
    return this.creditService.list(user.sub);
  }

  @Post()
  @ApiOperation({ summary: 'Accorder un crédit (décaisse réellement la source)' })
  async create(@Body() dto: CreateCreditDto, @CurrentUser() user: JwtPayload) {
    await this.authz.assertPermission(user.sub, 'CREDIT_GERER', 'accorder un crédit');
    return this.creditService.create(dto, user.sub);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Modifier un crédit en cours (montant / mois)' })
  async update(@Param('id') id: string, @Body() dto: UpdateCreditDto, @CurrentUser() user: JwtPayload) {
    await this.authz.assertPermission(user.sub, 'CREDIT_GERER', 'modifier un crédit');
    return this.creditService.update(id, dto, user.sub);
  }

  @Post(':id/solder')
  @ApiOperation({ summary: 'Solder (clôturer) un crédit' })
  async solder(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.authz.assertPermission(user.sub, 'CREDIT_GERER', 'solder un crédit');
    return this.creditService.solder(id, user.sub);
  }
}
