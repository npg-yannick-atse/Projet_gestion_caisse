import {
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateEmployeDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  matricule!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  @MaxLength(150)
  nom!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  @MaxLength(200)
  prenoms!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumberString()
  directionId?: string;

  @ApiProperty({ required: false, description: 'Salaire — DECIMAL(19,4) en string' })
  @IsOptional()
  @IsNumberString()
  salaire?: string;
}

export class UpdateEmployeDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  nom?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  prenoms?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumberString()
  directionId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumberString()
  salaire?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  estActif?: boolean;
}

export class CreateTypeBeneficeDto {
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
}

export class UpdateTypeBeneficeDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  libelle?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  estActif?: boolean;
}

export class CreateEmployeBeneficeDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsNumberString()
  typeBeneficeId!: string;

  @ApiProperty({ description: 'Montant — DECIMAL(19,4) en string' })
  @IsNotEmpty()
  @IsNumberString()
  montant!: string;

  @ApiProperty({ description: 'Début de validité (AAAA-MM-JJ)' })
  @IsNotEmpty()
  @IsDateString()
  dateDebut!: string;

  @ApiProperty({ description: 'Fin de validité (AAAA-MM-JJ)' })
  @IsNotEmpty()
  @IsDateString()
  dateFin!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  commentaire?: string;
}

export class UpdateEmployeBeneficeDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumberString()
  montant?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  dateDebut?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  dateFin?: string;

  @ApiProperty({ required: false, description: 'Passer à false libère le type pour un nouveau bénéfice.' })
  @IsOptional()
  @IsBoolean()
  estValide?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  commentaire?: string;
}
