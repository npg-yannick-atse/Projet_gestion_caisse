import { IsIn, IsNotEmpty, IsNumberString, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ProprietaireType } from '../entities/portefeuille.entity';

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
  @IsNumberString()
  soldeInitial?: string;
}
