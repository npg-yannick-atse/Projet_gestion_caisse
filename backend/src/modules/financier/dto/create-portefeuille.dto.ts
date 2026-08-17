import { IsBoolean, IsIn, IsNotEmpty, IsNumberString, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ProprietaireType } from '../entities/portefeuille.entity';
import { IsMontant } from '@common/validators/montant.validator';

export class CreatePortefeuilleDto {
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

  @ApiProperty({ description: 'Caisse source (fin_caisse)' })
  @IsNotEmpty()
  @IsNumberString()
  caisseSourceId!: string;

  @ApiProperty({ description: 'Devise (fin_devise) — doit correspondre à la caisse source' })
  @IsNotEmpty()
  @IsNumberString()
  deviseId!: string;

  @ApiProperty({ enum: ['USER', 'DIRECTION'] })
  @IsIn(['USER', 'DIRECTION'])
  proprietaireType!: ProprietaireType;

  @ApiProperty({ description: 'Identifiant du propriétaire (utilisateur ou direction)' })
  @IsNotEmpty()
  @IsNumberString()
  proprietaireId!: string;

  @ApiProperty({ required: false, description: 'Identifiant du gestionnaire de portefeuille' })
  @IsOptional()
  @IsNumberString()
  gestionnaireId?: string;

  @ApiProperty({ required: false, default: '0' })
  @IsOptional()
  @IsMontant()
  soldeInitial?: string;

  @ApiProperty({ required: false, description: 'Plafond budgétaire mensuel (réajusté chaque mois, sans report). Vide = pas de plafond mensuel.' })
  @IsOptional()
  @IsMontant()
  budgetMensuel?: string;

  @ApiProperty({ required: false, default: false, description: 'Portefeuille principal de sa caisse (un seul par caisse)' })
  @IsOptional()
  @IsBoolean()
  estPrincipal?: boolean;
}
