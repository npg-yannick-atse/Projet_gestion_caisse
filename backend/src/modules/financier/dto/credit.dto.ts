import { IsIn, IsInt, IsNotEmpty, IsNumberString, IsOptional, IsString, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCreditDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsNumberString()
  employeId!: string;

  @ApiProperty({ description: 'Montant du crédit. DECIMAL(19,4) en string.' })
  @IsNotEmpty()
  @IsNumberString()
  montant!: string;

  @ApiProperty({ description: 'Nombre de mois de remboursement' })
  @IsInt()
  @Min(1)
  nbMois!: number;

  @ApiProperty({ enum: ['CAISSE', 'PORTEFEUILLE'], description: 'Source de l\'argent décaissé' })
  @IsIn(['CAISSE', 'PORTEFEUILLE'])
  sourceType!: 'CAISSE' | 'PORTEFEUILLE';

  @ApiProperty({ description: 'Id de la caisse ou du portefeuille source' })
  @IsNotEmpty()
  @IsNumberString()
  sourceId!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  commentaire?: string;
}

export class UpdateCreditDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumberString()
  montant?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  nbMois?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  commentaire?: string;
}
