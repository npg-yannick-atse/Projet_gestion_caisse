import {
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PrepareBonCaisseDto {
  @ApiProperty({ description: 'Id du bon source' })
  @IsNotEmpty()
  @IsNumberString()
  bonId!: string;

  @ApiProperty({ description: 'Id du sous-bon a decaisser' })
  @IsNotEmpty()
  @IsNumberString()
  sousBonId!: string;
}

export class UpdateBonCaisseDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  beneficiaire?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  beneficiairePiece?: string;

  @ApiProperty({ required: false, description: 'Surcharge du libelle du sous-bon' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  libelleAjuste?: string;

  @ApiProperty({ required: false, description: 'Surcharge du montant DECIMAL(19,4) en string' })
  @IsOptional()
  @IsNumberString()
  montantAjuste?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  commentaire?: string;
}
