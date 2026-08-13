import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { DevisesService } from './devises.service';
import { CreateDeviseDto } from './dto/create-devise.dto';
import { UpdateDeviseDto } from './dto/update-devise.dto';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '@modules/auth/decorators/current-user.decorator';
import { AuthorizationService } from '@modules/security/authorization.service';

@ApiTags('Financier / Devises')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('devises')
export class DevisesController {
  constructor(
    private readonly devisesService: DevisesService,
    private readonly authz: AuthorizationService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Lister les devises' })
  @ApiQuery({ name: 'includeInactive', required: false, description: 'Inclure les devises désactivées (écran d’administration)' })
  findAll(@Query('includeInactive') includeInactive?: string) {
    return this.devisesService.findAll(includeInactive === 'true');
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtenir une devise' })
  findOne(@Param('id') id: string) {
    return this.devisesService.findOne(id);
  }

  // Une devise engage tout le référentiel monétaire : son nombre de décimales
  // gouverne l'arrondi de chaque conversion. On exige donc la permission en mode
  // STRICT — les administrateurs ne la contournent pas.
  @Post()
  @ApiOperation({ summary: 'Créer une devise' })
  async create(@Body() dto: CreateDeviseDto, @CurrentUser() user: JwtPayload) {
    await this.authz.assertPermissionStrict(user.sub, 'DEVISE_GERER', 'créer une devise');
    return this.devisesService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Modifier une devise' })
  async update(@Param('id') id: string, @Body() dto: UpdateDeviseDto, @CurrentUser() user: JwtPayload) {
    await this.authz.assertPermissionStrict(user.sub, 'DEVISE_GERER', 'modifier une devise');
    return this.devisesService.update(id, dto);
  }
}
