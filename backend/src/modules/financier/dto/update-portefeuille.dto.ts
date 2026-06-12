import { IsBoolean, IsIn, IsNumberString, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import type { ProprietaireType } from '../entities/portefeuille.entity';

export class UpdatePortefeuilleDto {
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
  caisseSourceId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumberString()
  deviseId?: string;

  @ApiProperty({ required: false, enum: ['USER', 'DIRECTION'] })
  @IsOptional()
  @IsIn(['USER', 'DIRECTION'])
  proprietaireType?: ProprietaireType;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumberString()
  proprietaireId?: string;

  @ApiProperty({ required: false, description: 'Identifiant du gestionnaire de portefeuille' })
  @IsOptional()
  @IsNumberString()
  gestionnaireId?: string;

  @ApiProperty({ required: false, description: 'Solde initial du portefeuille' })
  @IsOptional()
  @IsNumberString()
  soldeInitial?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  estActif?: boolean;
}
