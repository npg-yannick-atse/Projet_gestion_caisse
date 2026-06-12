import { IsNotEmpty, IsOptional, IsNumberString, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RechargeDto {
  @ApiProperty({ description: 'Caisse source (doit être OUVERTE)' })
  @IsNotEmpty()
  @IsNumberString()
  caisseId!: string;

  @ApiProperty({ description: 'Portefeuille cible (doit être rattaché à la caisse source)' })
  @IsNotEmpty()
  @IsNumberString()
  portefeuilleId!: string;

  @ApiProperty({ description: 'Montant à recharger. DECIMAL(19,4) en string.', example: '100000.0000' })
  @IsNotEmpty()
  @IsNumberString()
  montant!: string;

  @ApiProperty({ required: false, description: 'Référence libre (n° pièce, motif...)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string;
}
