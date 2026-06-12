import { IsOptional, IsNumberString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class OpenCaisseDto {
  @ApiProperty({
    required: false,
    description: 'Solde physique compté à l\'ouverture (déclaratif, sert à la réconciliation). DECIMAL(19,4) en string.',
    example: '0',
  })
  @IsOptional()
  @IsNumberString()
  soldeOuverture?: string;
}
