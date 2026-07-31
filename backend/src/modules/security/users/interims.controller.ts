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
import { AuthorizationService } from '../authorization.service';

/**
 * Sécurité (cf. migration 0040) :
 *  - CRÉER un intérim exige INTERIM_DECLARER, en mode STRICT (aucun bypass admin) :
 *    voir l'écran et pouvoir y créer une délégation sont deux droits distincts, et
 *    comme ce sont les administrateurs qui accèdent à l'écran, un bypass rendrait la
 *    permission décorative. Le service continue d'imposer que l'initiateur soit
 *    l'utilisateur courant et qu'il ne délègue QUE des droits qu'il détient déjà
 *    (assertCanDelegate) — c'est le garde-fou anti-escalade, il reste en place.
 *  - LISTER tous les intérims (vision transverse) exige INTERIM_VOIR ; les vues
 *    personnelles « mes délégations » / « je remplace » restent libres.
 *  - MODIFIER / RÉVOQUER : réservé à l'initiateur de l'intérim, ou à INTERIM_REVOQUER.
 */
@ApiTags('Security / Intérims')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('interims')
export class InterimsController {
  constructor(
    private readonly interimsService: InterimsService,
    private readonly authz: AuthorizationService,
  ) {}

  /** Autorise l'initiateur de l'intérim, sinon exige INTERIM_REVOQUER. */
  private async assertPeutAgirSur(id: string, user: JwtPayload, action: string) {
    const interim = await this.interimsService.findOne(id);
    if (String(interim.initiateurId) === String(user.sub)) return;
    await this.authz.assertPermission(user.sub, 'INTERIM_REVOQUER', action);
  }

  @Post()
  @ApiOperation({
    summary:
      "Créer un intérim — INTERIM_DECLARER (le sien) ; INTERIM_DECLARER_TIERS en plus pour déclarer au nom d'un autre",
  })
  async create(@Body() dto: CreateInterimDto, @CurrentUser() user: JwtPayload) {
    // Droit de base ; le cas « au nom d'un tiers » ajoute INTERIM_DECLARER_TIERS,
    // vérifiée dans le service qui connaît l'initiateur réellement retenu.
    await this.authz.assertPermissionStrict(user.sub, 'INTERIM_DECLARER', 'déclarer un intérim');
    return this.interimsService.create(dto, user.sub);
  }

  @Get()
  @ApiOperation({ summary: 'Lister les intérims (vision transverse — permission INTERIM_VOIR)' })
  async findAll(@CurrentUser() user: JwtPayload, @Query('statut') statut?: string) {
    await this.authz.assertPermission(
      user.sub,
      'INTERIM_VOIR',
      'consulter les intérims de tous les utilisateurs',
    );
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
  async findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    const interim = await this.interimsService.findOne(id);
    const concerne =
      String(interim.initiateurId) === String(user.sub) ||
      String(interim.remplacantId) === String(user.sub);
    if (!concerne) {
      await this.authz.assertPermission(user.sub, 'INTERIM_VOIR', 'consulter cet intérim');
    }
    return interim;
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Mettre à jour un intérim' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateInterimDto,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.assertPeutAgirSur(id, user, 'modifier cet intérim');
    return this.interimsService.update(id, dto);
  }

  @Post(':id/revoke')
  @ApiOperation({ summary: 'Révoquer un intérim' })
  async revoke(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.assertPeutAgirSur(id, user, 'révoquer cet intérim');
    return this.interimsService.revoke(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      "Supprimer un intérim — NON IMPLÉMENTÉ : ne supprime rien, utiliser /revoke (route conservée pour compatibilité)",
  })
  async remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.assertPeutAgirSur(id, user, 'supprimer cet intérim');
    // Volontairement sans effet : un intérim ne se supprime pas, il se révoque
    // (traçabilité). Le contrôle d'accès ci-dessus évite qu'un appelant non
    // habilité obtienne un 204 laissant croire à une suppression.
  }
}
