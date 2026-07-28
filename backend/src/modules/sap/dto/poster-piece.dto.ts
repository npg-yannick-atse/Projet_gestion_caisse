import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/** Une ligne d'écriture (un compte général, un sens, un montant). */
export class LigneEcritureDto {
  @ApiProperty({ description: 'Compte général SAP (GL_ACCOUNT)' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(10)
  compteGL!: string;

  @ApiProperty({ enum: ['D', 'C'], description: 'Débit (D) ou Crédit (C)' })
  @IsIn(['D', 'C'])
  sens!: 'D' | 'C';

  @ApiProperty({ description: 'Montant (valeur absolue positive)' })
  @IsNumber()
  @IsPositive()
  montant!: number;

  @ApiProperty({ required: false, description: 'Libellé de la ligne (ITEM_TEXT)' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  texte?: string;

  @ApiProperty({ required: false, description: 'Centre de coût (COSTCENTER)' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  centreCout?: string;
}

/** Pièce comptable à contrôler / poster dans SAP (BAPI_ACC_DOCUMENT_*). */
export class PosterPieceDto {
  @ApiProperty({ description: 'Société (COMP_CODE)' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(4)
  societe!: string;

  @ApiProperty({ description: 'Devise (CURRENCY), ex : XOF' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(5)
  devise!: string;

  @ApiProperty({ required: false, description: 'Type de pièce / Belegart (DOC_TYPE), ex : SA' })
  @IsOptional()
  @IsString()
  @MaxLength(2)
  typePiece?: string;

  @ApiProperty({ required: false, description: 'Date pièce AAAAMMJJ ou AAAA-MM-JJ (DOC_DATE)' })
  @IsOptional()
  @IsString()
  datePiece?: string;

  @ApiProperty({ required: false, description: 'Date comptable AAAAMMJJ ou AAAA-MM-JJ (PSTNG_DATE)' })
  @IsOptional()
  @IsString()
  dateComptable?: string;

  @ApiProperty({ required: false, description: 'Référence (REF_DOC_NO)' })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  reference?: string;

  @ApiProperty({ required: false, description: 'Texte d’en-tête (HEADER_TXT)' })
  @IsOptional()
  @IsString()
  @MaxLength(25)
  texte?: string;

  @ApiProperty({ type: [LigneEcritureDto], description: 'Lignes (doivent être équilibrées débit = crédit)' })
  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => LigneEcritureDto)
  lignes!: LigneEcritureDto[];
}
