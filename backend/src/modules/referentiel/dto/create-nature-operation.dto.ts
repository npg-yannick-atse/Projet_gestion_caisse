import { IsNotEmpty, IsNumberString, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateNatureOperationDto {
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

  @ApiProperty({ required: false, description: 'Centre de coût par défaut (optionnel)' })
  @IsOptional()
  @IsNumberString()
  costCenterId?: string;

  @ApiProperty({ required: false, description: 'Compte du plan comptable par défaut (optionnel)' })
  @IsOptional()
  @IsNumberString()
  planComptableId?: string;
}
