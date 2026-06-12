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
import { InterimsService } from './interims.service';
import { CreateInterimDto, UpdateInterimDto } from './dto/interim.dto';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '@modules/auth/decorators/current-user.decorator';

@ApiTags('Security / Intérims')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('interims')
export class InterimsController {
  constructor(private readonly interimsService: InterimsService) {}

  @Post()
  @ApiOperation({ summary: 'Créer un intérim' })
  create(@Body() dto: CreateInterimDto) {
    return this.interimsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Lister les intérims' })
  findAll(@Query('statut') statut?: string) {
    return this.interimsService.findAll(statut);
  }

  @Get('by-initiator')
  @ApiOperation({ summary: 'Lister les intérims actifs où l\'utilisateur est initiateur' })
  findByInitiator(@CurrentUser() user: JwtPayload) {
    return this.interimsService.findByInitiator(user.sub);
  }

  @Get('by-remplacant')
  @ApiOperation({ summary: 'Lister les intérims actifs où l\'utilisateur est remplaçant' })
  findByRemplacant(@CurrentUser() user: JwtPayload) {
    return this.interimsService.findByRemplacant(user.sub);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtenir un intérim par id' })
  findOne(@Param('id') id: string) {
    return this.interimsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Mettre à jour un intérim' })
  update(@Param('id') id: string, @Body() dto: UpdateInterimDto) {
    return this.interimsService.update(id, dto);
  }

  @Post(':id/revoke')
  @ApiOperation({ summary: 'Révoquer un intérim' })
  revoke(@Param('id') id: string) {
    return this.interimsService.revoke(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer un intérim' })
  async remove(@Param('id') id: string) {
    await this.interimsService.findOne(id);
    // Soft delete would be handled here if needed
  }
}
