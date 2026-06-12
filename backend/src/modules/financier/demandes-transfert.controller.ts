import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DemandesTransfertService } from './demandes-transfert.service';
import {
  CreateDemandeTransfertDto,
  DecisionDemandeTransfertDto,
} from './dto/create-demande-transfert.dto';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '@modules/auth/decorators/current-user.decorator';

@ApiTags('Financier / Demandes de transfert')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('demandes-transfert')
export class DemandesTransfertController {
  constructor(private readonly service: DemandesTransfertService) {}

  @Get()
  @ApiOperation({ summary: 'Lister les demandes de transfert (tri + filtres BD)' })
  findAll(
    @Query('statut') statut?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: string,
  ) {
    return this.service.findAll({
      statut: statut as any,
      sortBy,
      sortDir: sortDir === 'asc' ? 'asc' : sortDir === 'desc' ? 'desc' : undefined,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Détail d\'une demande de transfert' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Créer une demande de transfert' })
  create(@Body() dto: CreateDemandeTransfertDto, @CurrentUser() user: JwtPayload) {
    return this.service.create(dto, user.sub);
  }

  @Post(':id/decision')
  @ApiOperation({ summary: 'Approuver ou rejeter une demande' })
  decision(
    @Param('id') id: string,
    @Body() dto: DecisionDemandeTransfertDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.decision(id, dto, user.sub);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Annuler sa propre demande (statut CREE uniquement)' })
  cancel(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.cancel(id, user.sub);
  }

  @Post(':id/execute')
  @ApiOperation({ summary: 'Exécuter une demande approuvée (création opération TRANSFERT)' })
  execute(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.execute(id, user.sub);
  }
}
