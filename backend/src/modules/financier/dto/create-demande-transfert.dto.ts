import { IsIn, IsNotEmpty, IsNumberString, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import type { TransfertCompteType } from '../entities/demande-transfert.entity';

export class CreateDemandeTransfertDto {
  @ApiProperty({ enum: ['CAISSE', 'PORTEFEUILLE'] })
  @IsIn(['CAISSE', 'PORTEFEUILLE'])
  sourceType!: TransfertCompteType;

  @ApiProperty()
  @IsNotEmpty()
  @IsNumberString()
  sourceId!: string;

  @ApiProperty({ enum: ['CAISSE', 'PORTEFEUILLE'] })
  @IsIn(['CAISSE', 'PORTEFEUILLE'])
  destinationType!: TransfertCompteType;

  @ApiProperty()
  @IsNotEmpty()
  @IsNumberString()
  destinationId!: string;

  @ApiProperty({ description: 'Montant DECIMAL(19,4) en string' })
  @IsNotEmpty()
  @IsNumberString()
  montant!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsNumberString()
  deviseId!: string;

  @ApiProperty({ required: false, description: 'Motif libre de la demande' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  motif?: string;
}

export class DecisionDemandeTransfertDto {
  @ApiProperty({ description: 'true = approuver, false = rejeter' })
  approuve!: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  commentaire?: string;
}
