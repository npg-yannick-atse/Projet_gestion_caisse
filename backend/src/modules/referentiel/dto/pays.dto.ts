import { IsNotEmpty, IsNumberString, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreatePaysDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  @MaxLength(10)
  code!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  @MaxLength(150)
  libelle!: string;
}

export class CreateDivisionDto {
  @ApiProperty({ required: false, description: 'Optionnel : dérivé du libellé si absent.' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  code?: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  @MaxLength(150)
  libelle!: string;

  @ApiProperty({ description: 'Id du pays parent' })
  @IsNotEmpty()
  @IsNumberString()
  paysId!: string;
}
