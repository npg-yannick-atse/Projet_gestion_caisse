import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ParametresService } from './parametres.service';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '@modules/auth/decorators/current-user.decorator';
import { Roles } from '@modules/auth/decorators/roles.decorator';

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
  constructor(private readonly parametres: ParametresService) {}

  @Get()
  @ApiOperation({ summary: 'Lister les paramètres applicatifs' })
  list() {
    return this.parametres.list();
  }

  @Patch(':cle')
  @Roles('ADMINISTRATEUR')
  @ApiOperation({ summary: 'Modifier un paramètre' })
  update(@Param('cle') cle: string, @Body() dto: UpdateParametreDto, @CurrentUser() user: JwtPayload) {
    return this.parametres.set(cle, dto.valeur, user.sub);
  }
}
