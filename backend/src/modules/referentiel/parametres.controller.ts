import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ParametresService } from './parametres.service';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '@modules/auth/decorators/current-user.decorator';
import { AuthorizationService } from '@modules/security/authorization.service';

class UpdateParametreDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(400)
  valeur!: string;
}

@ApiTags('Référentiel / Paramètres')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('parametres')
export class ParametresController {
  constructor(
    private readonly parametres: ParametresService,
    private readonly authz: AuthorizationService,
  ) {}

  /**
   * La lecture reste ouverte : les règles d'avance (AVANCE_JOUR_MIN,
   * AVANCE_POURCENTAGE_MAX) sont nécessaires côté client pour valider un
   * formulaire. Seule la modification exige PARAMETRE_MODIFIER (migration 0040).
   */
  @Get()
  @ApiOperation({ summary: 'Lister les paramètres applicatifs' })
  list() {
    return this.parametres.list();
  }

  @Patch(':cle')
  @ApiOperation({ summary: 'Modifier un paramètre' })
  async update(@Param('cle') cle: string, @Body() dto: UpdateParametreDto, @CurrentUser() user: JwtPayload) {
    await this.authz.assertPermission(user.sub, 'PARAMETRE_MODIFIER', 'modifier un paramètre');
    return this.parametres.set(cle, dto.valeur, user.sub);
  }
}
