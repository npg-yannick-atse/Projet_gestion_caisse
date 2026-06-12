import { Body, Controller, Delete, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PushService } from './push.service';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '@modules/auth/decorators/current-user.decorator';

@ApiTags('Notifications / Push')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('push-tokens')
export class PushController {
  constructor(private readonly push: PushService) {}

  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Enregistrer le jeton push de l'appareil courant" })
  async register(
    @Body() dto: { token: string; platform?: string },
    @CurrentUser() user: JwtPayload,
  ) {
    await this.push.registerToken(user.sub, dto.token, dto.platform);
  }

  @Delete(':token')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer un jeton push (déconnexion)' })
  async remove(@Param('token') token: string) {
    await this.push.removeToken(token);
  }
}
