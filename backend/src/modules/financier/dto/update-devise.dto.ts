import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Le CODE n'est pas modifiable : il sert de clé de rapprochement avec SAP et
 * l'API de cotation, et il est recopié dans les libellés d'opérations passées.
 * Le renommer ferait mentir l'historique.
 */
export class UpdateDeviseDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  libelle?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  symbole?: string;

  @ApiProperty({ required: false, description: 'Verrouillé dès qu’une écriture existe dans cette devise' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(4)
  nbDecimales?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  estActif?: boolean;
}
