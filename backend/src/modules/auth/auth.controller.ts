import { Body, ClassSerializerInterceptor, Controller, Get, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto, RefreshDto, TokensResponse } from './dto/login.dto';
import { Public } from './decorators/public.decorator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from './decorators/current-user.decorator';
import { UsersService } from '@modules/security/users/users.service';

@ApiTags('Auth')
@UseInterceptors(ClassSerializerInterceptor)
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly users: UsersService,
  ) {}

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Authentification par matricule/email + mot de passe' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.identifiant, dto.motDePasse, dto.plateforme);
  }

  @Public()
  @Post('refresh')
  @ApiOperation({ summary: 'Rafraichir un access token a partir d\'un refresh token' })
  refresh(@Body() dto: RefreshDto): Promise<TokensResponse> {
    return this.authService.refresh(dto.refreshToken);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('me')
  @ApiOperation({ summary: 'Profil utilisateur courant' })
  me(@CurrentUser() payload: JwtPayload) {
    return this.users.findOne(payload.sub);
  }
}
