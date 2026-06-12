import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export type Plateforme = 'WEB' | 'MOBILE';

export class LoginDto {
  @ApiProperty({ example: 'EMP-001', description: 'Matricule ou email' })
  @IsString()
  @IsNotEmpty()
  identifiant!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  motDePasse!: string;

  @ApiProperty({
    required: false,
    enum: ['WEB', 'MOBILE'],
    description: "Plateforme du client (web ou mobile). Si fournie, l'accès est vérifié.",
  })
  @IsOptional()
  @IsIn(['WEB', 'MOBILE'])
  plateforme?: Plateforme;
}

export class RefreshDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}

export class TokensResponse {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty()
  refreshToken!: string;

  @ApiProperty()
  expiresIn!: number;
}
