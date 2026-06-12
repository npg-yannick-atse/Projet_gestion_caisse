import { IsNotEmpty, IsNumberString, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCostCenterDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  code!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  @MaxLength(200)
  libelle!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumberString()
  directionId?: string;

  @ApiProperty({ required: false, description: 'DECIMAL(19,4) en string' })
  @IsOptional()
  @IsNumberString()
  budgetAnnuel?: string;
}
