import { IsBoolean, IsNotEmpty, IsNumberString, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCaisseDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  code!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  @MaxLength(200)
  libelle!: string;

  @ApiProperty({ description: 'Identifiant de la devise (fin_devise)' })
  @IsNotEmpty()
  @IsNumberString()
  deviseId!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumberString()
  siteId?: string;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  estPrincipale?: boolean;
}
