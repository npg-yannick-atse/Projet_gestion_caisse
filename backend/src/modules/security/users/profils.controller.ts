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
import { ProfilsService } from './profils.service';
import { CreateProfilDto, UpdateProfilDto } from './dto/profil.dto';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { Roles } from '@modules/auth/decorators/roles.decorator';

@ApiTags('Security / Profils')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('profils')
export class ProfilsController {
  constructor(private readonly profilsService: ProfilsService) {}

  @Post()
  @Roles('ADMINISTRATEUR')
  @ApiOperation({ summary: 'Créer un profil' })
  createProfil(@Body() dto: CreateProfilDto) {
    return this.profilsService.createProfil(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Lister les profils actifs' })
  findAllProfils() {
    return this.profilsService.findAllProfils();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtenir un profil par id' })
  findProfil(@Param('id') id: string) {
    return this.profilsService.findProfil(id);
  }

  @Patch(':id')
  @Roles('ADMINISTRATEUR')
  @ApiOperation({ summary: 'Mettre à jour un profil' })
  updateProfil(@Param('id') id: string, @Body() dto: UpdateProfilDto) {
    return this.profilsService.updateProfil(id, dto);
  }

  @Delete(':id')
  @Roles('ADMINISTRATEUR')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer (désactiver) un profil' })
  async removeProfil(@Param('id') id: string) {
    await this.profilsService.removeProfil(id);
  }

  // Profil ↔ Permission
  @Get(':profilId/permissions')
  @ApiOperation({ summary: "Lister les permissions d'un profil" })
  getProfilPermissions(@Param('profilId') profilId: string) {
    return this.profilsService.getProfilPermissions(profilId);
  }

  @Post(':profilId/permissions/:permissionId')
  @Roles('ADMINISTRATEUR')
  @ApiOperation({ summary: 'Assigner une permission à un profil' })
  assignPermission(
    @Param('profilId') profilId: string,
    @Param('permissionId') permissionId: string,
  ) {
    return this.profilsService.assignPermissionToProfil(profilId, permissionId);
  }

  @Delete(':profilId/permissions/:permissionId')
  @Roles('ADMINISTRATEUR')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Retirer une permission d'un profil" })
  async removePermission(
    @Param('profilId') profilId: string,
    @Param('permissionId') permissionId: string,
  ) {
    await this.profilsService.removePermissionFromProfil(profilId, permissionId);
  }
}
