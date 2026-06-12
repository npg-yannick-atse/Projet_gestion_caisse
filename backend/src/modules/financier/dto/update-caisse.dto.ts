import { IsBoolean, IsNumberString, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateCaisseDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  code?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  libelle?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumberString()
  deviseId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumberString()
  siteId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  estPrincipale?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  estActif?: boolean;
}
