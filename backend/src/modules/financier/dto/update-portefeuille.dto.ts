import { IsBoolean, IsIn, IsNumberString, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';
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

  @ApiProperty({ required: false, description: 'Plafond budgétaire mensuel (réajusté chaque mois, sans report). Vide = pas de plafond mensuel.' })
  @IsOptional()
  // Chaîne vide = effacer le plafond : on saute la validation numérique dans ce cas
  // (le service interprète '' comme null). @IsNumberString rejette '' sinon.
  @ValidateIf((o) => o.budgetMensuel !== '')
  @IsNumberString()
  budgetMensuel?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  estActif?: boolean;
}
