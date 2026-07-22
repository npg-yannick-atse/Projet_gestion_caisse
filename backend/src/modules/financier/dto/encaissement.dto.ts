import { IsNotEmpty, IsOptional, IsNumberString, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class EncaissementDto {
  @ApiProperty({ description: 'Caisse qui reçoit l\'argent (doit être OUVERTE)' })
  @IsNotEmpty()
  @IsNumberString()
  caisseId!: string;

  @ApiProperty({ description: 'Montant encaissé. DECIMAL(19,4) en string.', example: '100000.0000' })
  @IsNotEmpty()
  @IsNumberString()
  montant!: string;

  @ApiProperty({ required: false, description: 'Nom du client qui paie' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  clientNom?: string;

  @ApiProperty({ required: false, description: 'Numéro / identifiant du client' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  clientNumero?: string;

  @ApiProperty({ required: false, description: 'Motif / provenance (dotation, banque, règlement...)' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  motif?: string;

  @ApiProperty({ required: false, description: 'Référence libre (n° pièce...)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string;
}
