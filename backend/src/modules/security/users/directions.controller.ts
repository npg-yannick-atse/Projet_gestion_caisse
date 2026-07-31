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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DirectionsService } from './directions.service';
import { CreateDirectionDto, UpdateDirectionDto } from './dto/direction.dto';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '@modules/auth/decorators/current-user.decorator';
import { AuthorizationService } from '../authorization.service';

/**
 * Sécurité : mutations sur DIRECTION_GERER (cf. migration 0040). La liste des
 * directions reste lisible par tout utilisateur authentifié — elle sert de
 * sélecteur dans les écrans caisses, portefeuilles, employés, centres de coût.
 */
@ApiTags('Security / Directions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('directions')
export class DirectionsController {
  constructor(
    private readonly directionsService: DirectionsService,
    private readonly authz: AuthorizationService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Créer une direction' })
  async create(@Body() dto: CreateDirectionDto, @CurrentUser() user: JwtPayload) {
    await this.authz.assertPermission(user.sub, 'DIRECTION_GERER', 'créer une direction');
    return this.directionsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Lister les directions (recherche + tri en base)' })
  findAll(@Query('search') search?: string, @Query('sortBy') sortBy?: string, @Query('sortDir') sortDir?: string) {
    return this.directionsService.findAll({
      search,
      sortBy,
      sortDir: sortDir === 'desc' ? 'desc' : sortDir === 'asc' ? 'asc' : undefined,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtenir une direction par id' })
  findOne(@Param('id') id: string) {
    return this.directionsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Mettre à jour une direction' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateDirectionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.authz.assertPermission(user.sub, 'DIRECTION_GERER', 'modifier une direction');
    return this.directionsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer une direction' })
  async remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.authz.assertPermission(user.sub, 'DIRECTION_GERER', 'supprimer une direction');
    await this.directionsService.remove(id);
  }
}
