import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsTaux } from '@common/validators/taux.validator';

export class CreateTauxChangeDto {
  @ApiProperty({ description: 'Devise de départ' })
  @IsNotEmpty()
  @IsNumberString()
  deviseSourceId!: string;

  @ApiProperty({ description: "Devise d'arrivée" })
  @IsNotEmpty()
  @IsNumberString()
  deviseCibleId!: string;

  @ApiProperty({ description: 'montantCible = montantSource × taux. DECIMAL(19,8) en string' })
  @IsNotEmpty()
  @IsTaux()
  taux!: string;

  @ApiProperty({
    required: false,
    description:
      "Début de validité (ISO). Par défaut : maintenant. Antidater est permis — c'est ainsi qu'on rattrape un taux constaté la semaine passée.",
  })
  @IsOptional()
  @IsDateString()
  dateValiditeDebut?: string;

  @ApiProperty({ required: false, description: 'Pourquoi ce taux' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  motif?: string;

  @ApiProperty({
    required: false,
    enum: ['MANUEL', 'SAP', 'API'],
    description: "Réservé à l'import automatique ; une saisie à l'écran est toujours MANUEL.",
  })
  @IsOptional()
  @IsIn(['MANUEL', 'SAP', 'API'])
  source?: 'MANUEL' | 'SAP' | 'API';

  @ApiProperty({
    required: false,
    description:
      "Parité fixée par accord monétaire (EUR → XOF). L'import automatique n'y touche pas. " +
      'Omis, le réglage du taux précédent est repris.',
  })
  @IsOptional()
  @IsBoolean()
  pariteFixe?: boolean;
}

export class ConvertirDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsNumberString()
  deviseSourceId!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsNumberString()
  deviseCibleId!: string;

  @ApiProperty({ description: 'Montant à convertir' })
  @IsNotEmpty()
  @IsNumberString()
  montant!: string;

  @ApiProperty({ required: false, description: 'Date de conversion (ISO). Par défaut : maintenant.' })
  @IsOptional()
  @IsDateString()
  date?: string;
}
