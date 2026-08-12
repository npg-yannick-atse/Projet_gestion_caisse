import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TauxChangeService } from './taux-change.service';
import { TauxApiService } from './taux-api.service';
import { ConvertirDto, CreateTauxChangeDto } from './dto/taux-change.dto';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '@modules/auth/decorators/current-user.decorator';

/**
 * LECTURE ouverte à tout utilisateur authentifié : les taux alimentent des
 * affichages sur le web comme sur le mobile, les verrouiller aveuglerait les
 * écrans sans rien protéger (règle de conception du 31/07/2026).
 *
 * ÉCRITURE gardée par `TAUX_GERER`, vérifiée dans le service.
 */
@ApiTags('Financier / Taux de change')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('taux-change')
export class TauxChangeController {
  constructor(
    private readonly service: TauxChangeService,
    private readonly tauxApi: TauxApiService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Les taux en vigueur, un par couple de devises, avec leur âge' })
  listeCourants() {
    return this.service.listeCourants();
  }

  @Get('reference')
  @ApiOperation({ summary: 'Devise de consolidation des totaux convertis' })
  reference() {
    return this.service.deviseReference();
  }

  @Get('historique/:deviseSourceId/:deviseCibleId')
  @ApiOperation({ summary: "Toutes les périodes d'un couple, de la plus récente à la plus ancienne" })
  historique(
    @Param('deviseSourceId') deviseSourceId: string,
    @Param('deviseCibleId') deviseCibleId: string,
  ) {
    return this.service.historique(deviseSourceId, deviseCibleId);
  }

  @Get('convertir')
  @ApiOperation({ summary: "Convertir un montant, à la date du jour ou à une date passée" })
  convertir(@Query() dto: ConvertirDto) {
    return this.service.convertir(
      dto.montant,
      dto.deviseSourceId,
      dto.deviseCibleId,
      dto.date ? new Date(dto.date) : new Date(),
    );
  }

  @Post()
  @ApiOperation({
    summary: 'Enregistrer un taux (clôt le précédent et en ouvre un nouveau)',
    description:
      "Le taux en vigueur n'est jamais modifié : il est clôturé à la date d'effet du nouveau. " +
      'Exige la permission TAUX_GERER.',
  })
  enregistrer(@Body() dto: CreateTauxChangeDto, @CurrentUser() user: JwtPayload) {
    return this.service.enregistrer(dto, user.sub);
  }

  @Post('importer')
  @ApiOperation({
    summary: "Rapatrier les taux depuis l'API de cotation, maintenant",
    description:
      "Les parités fixes et les taux inchangés ne sont pas réécrits. Renvoie le détail devise " +
      'par devise, y compris ce qui a échoué. Exige la permission TAUX_GERER.',
  })
  importer(@CurrentUser() user: JwtPayload) {
    return this.tauxApi.importerManuel(user.sub);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Retirer un taux ; le précédent redevient le taux en vigueur',
    description: 'Exige la permission TAUX_GERER.',
  })
  supprimer(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.service.supprimer(id, user.sub);
  }
}
