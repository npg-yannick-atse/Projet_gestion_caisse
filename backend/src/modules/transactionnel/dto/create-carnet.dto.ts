import { IsInt, IsNotEmpty, IsNumberString, IsOptional, IsString, Min, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCarnetDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  libelle?: string;

  @ApiProperty({ description: 'Caisse rattachée' })
  @IsNotEmpty()
  @IsNumberString()
  caisseId!: string;

  @ApiProperty({ description: 'Caissier détenteur du carnet' })
  @IsNotEmpty()
  @IsNumberString()
  caissierId!: string;

  @ApiProperty({ example: 1000 })
  @IsInt()
  @Min(0)
  numeroDebut!: number;

  @ApiProperty({ example: 1050 })
  @IsInt()
  @Min(0)
  numeroFin!: number;
}
