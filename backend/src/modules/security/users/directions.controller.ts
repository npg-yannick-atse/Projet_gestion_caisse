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
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DirectionsService } from './directions.service';
import { CreateDirectionDto, UpdateDirectionDto } from './dto/direction.dto';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';

@ApiTags('Security / Directions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('directions')
export class DirectionsController {
  constructor(private readonly directionsService: DirectionsService) {}

  @Post()
  @ApiOperation({ summary: 'Créer une direction' })
  create(@Body() dto: CreateDirectionDto) {
    return this.directionsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Lister les directions actives' })
  findAll() {
    return this.directionsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtenir une direction par id' })
  findOne(@Param('id') id: string) {
    return this.directionsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Mettre à jour une direction' })
  update(@Param('id') id: string, @Body() dto: UpdateDirectionDto) {
    return this.directionsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer une direction' })
  async remove(@Param('id') id: string) {
    await this.directionsService.remove(id);
  }
}
