import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsMontant } from '@common/validators/montant.validator';

/**
 * Création d'un bon et de ses sous-bons.
 *
 * Ce fichier remplace l'ancienne `interface CreateBonRequest` du contrôleur.
 * Une interface TypeScript disparaît à la compilation : le ValidationPipe
 * n'avait donc RIEN à valider et l'intégralité du corps de la requête passait
 * sans le moindre contrôle — y compris le numéro client, qui acceptait des
 * lettres alors que tous les autres écrans les refusaient.
 *
 * `@ValidateNested({ each: true })` + `@Type` sont indispensables : sans eux,
 * class-validator ne descend pas dans le tableau `soubons` et les règles
 * ci-dessous resteraient lettre morte.
 */
export class CreateSousBonDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  libelle!: string;

  @ApiProperty({ example: '50000' })
  @IsNotEmpty()
  @IsMontant()
  montant!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumberString()
  partenaireId?: string | null;

  @ApiProperty()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  numeroBl!: string;

  @ApiProperty()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  codeManutention!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsNumberString()
  costCenterId!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumberString()
  natureOperationId?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumberString()
  natureComptableId?: string | null;

  @ApiProperty()
  @IsNotEmpty()
  @IsNumberString()
  caisseId!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsNumberString()
  portefeuilleId!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsNumberString()
  deviseId!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  // Le numéro client est un identifiant SAP (KUNNR) : chiffres uniquement.
  // Chaîne vide tolérée = champ non renseigné.
  @Matches(/^[0-9]*$/, { message: 'Le numéro client ne doit contenir que des chiffres.' })
  numeroClient?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  nomClient?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumberString()
  paysId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumberString()
  divisionId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class CreateBonDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsNumberString()
  typeBonId!: string;

  @ApiProperty({ type: [CreateSousBonDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'Un bon doit comporter au moins un sous-bon.' })
  @ValidateNested({ each: true })
  @Type(() => CreateSousBonDto)
  soubons!: CreateSousBonDto[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  estRecurrent?: boolean;

  @ApiProperty({ required: false, enum: ['MENSUEL', 'TRIMESTRIEL', 'SEMESTRIEL', 'ANNUEL'] })
  @IsOptional()
  @IsIn(['MENSUEL', 'TRIMESTRIEL', 'SEMESTRIEL', 'ANNUEL'])
  frequenceRecurrence?: 'MENSUEL' | 'TRIMESTRIEL' | 'SEMESTRIEL' | 'ANNUEL';

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  demandeExtension?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  descriptionExtension?: string;

  @ApiProperty({ required: false, description: 'Personne qui se présentera à la caisse' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  porteur?: string;
}
