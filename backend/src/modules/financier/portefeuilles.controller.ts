import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PortefeuillesService } from './portefeuilles.service';
import { CreatePortefeuilleDto } from './dto/create-portefeuille.dto';
import { UpdatePortefeuilleDto } from './dto/update-portefeuille.dto';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '@modules/auth/decorators/current-user.decorator';
import { AuthorizationService } from '@modules/security/authorization.service';

@ApiTags('Financier / Portefeuilles')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('portefeuilles')
export class PortefeuillesController {
  constructor(
    private readonly portefeuillesService: PortefeuillesService,
    private readonly authz: AuthorizationService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Créer un portefeuille' })
  async create(@Body() dto: CreatePortefeuilleDto, @CurrentUser() user: JwtPayload) {
    await this.authz.assertPermission(user.sub, 'PORTEFEUILLE_MODIFIER', 'créer un portefeuille');
    return this.portefeuillesService.create(dto, user.sub);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Mettre à jour un portefeuille' })
  async update(@Param('id') id: string, @Body() dto: UpdatePortefeuilleDto, @CurrentUser() user: JwtPayload) {
    await this.authz.assertPermission(user.sub, 'PORTEFEUILLE_MODIFIER', 'modifier un portefeuille');
    return this.portefeuillesService.update(id, dto, user.sub);
  }

  @Patch(':id/toggle-active')
  @ApiOperation({ summary: 'Activer / désactiver un portefeuille' })
  async toggleActive(
    @Param('id') id: string,
    @Body() dto: { estActif: boolean },
    @CurrentUser() user: JwtPayload,
  ) {
    await this.authz.assertPermission(user.sub, 'PORTEFEUILLE_MODIFIER', 'activer/désactiver un portefeuille');
    return this.portefeuillesService.toggleActif(id, dto.estActif, user.sub);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer un portefeuille (soft-delete)' })
  async remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.authz.assertPermission(user.sub, 'PORTEFEUILLE_SUPPRIMER', 'supprimer un portefeuille');
    await this.portefeuillesService.softDelete(id, user.sub);
  }

  @Get()
  @ApiOperation({ summary: 'Lister les portefeuilles actifs (filtrable par caisse source)' })
  @ApiQuery({ name: 'caisseId', required: false })
  findAll(@Query('caisseId') caisseId?: string) {
    return this.portefeuillesService.findAll(caisseId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtenir un portefeuille' })
  findOne(@Param('id') id: string) {
    return this.portefeuillesService.findOne(id);
  }

  @Get(':id/solde')
  @ApiOperation({ summary: 'Solde courant du portefeuille (calculé depuis les écritures)' })
  async getSolde(@Param('id') id: string) {
    const { solde, soldeInitial } = await this.portefeuillesService.getSoldeDetail(id);
    return { portefeuilleId: id, typeCompte: 'PORTEFEUILLE', solde, soldeInitial };
  }
}
