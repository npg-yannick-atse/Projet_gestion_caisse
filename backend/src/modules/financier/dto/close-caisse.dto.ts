import { IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsMontant } from '@common/validators/montant.validator';

export class CloseCaisseDto {
  @ApiProperty({
    required: false,
    description:
      'Solde physique compté à la clôture (déclaratif). Si omis, le solde calculé depuis les écritures est enregistré.',
    example: '0',
  })
  @IsOptional()
  @IsMontant()
  soldeCloture?: string;
}
