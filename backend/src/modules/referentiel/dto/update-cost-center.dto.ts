import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsMontant } from '@common/validators/montant.validator';

/**
 * Mise à jour d'un centre de coût.
 * Le `code` est volontairement non modifiable (il est référencé par les
 * natures d'opération et les bons) : on n'édite que libellé, direction et budget.
 */
export class UpdateCostCenterDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  libelle?: string;

  @ApiProperty({ required: false, description: 'Id de direction, ou "" pour détacher' })
  @IsOptional()
  @IsString()
  directionId?: string;

  @ApiProperty({ required: false, description: 'Budget mensuel — DECIMAL(19,4) en string, ou "" pour vider' })
  @IsOptional()
  @IsMontant({ autoriserVide: true })
  budgetMensuel?: string;
}
