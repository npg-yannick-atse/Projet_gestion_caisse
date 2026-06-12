import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DevisesService } from './devises.service';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';

@ApiTags('Financier / Devises')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('devises')
export class DevisesController {
  constructor(private readonly devisesService: DevisesService) {}

  @Get()
  @ApiOperation({ summary: 'Lister les devises actives' })
  findAll() {
    return this.devisesService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtenir une devise' })
  findOne(@Param('id') id: string) {
    return this.devisesService.findOne(id);
  }
}
