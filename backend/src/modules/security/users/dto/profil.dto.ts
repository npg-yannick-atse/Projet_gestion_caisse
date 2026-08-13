import { IsString, IsOptional, IsBoolean, IsNotEmpty, IsISO8601, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Période de validité d'un profil attribué (migration 0061).
 * Les deux bornes sont facultatives : absentes, le profil est permanent — ce qui
 * reste le comportement par défaut et celui des appels qui n'envoient rien.
 */
export class AssignProfilDto {
  @ApiProperty({ required: false, description: 'Effectif à partir de cette date. Absent = tout de suite.' })
  @IsOptional()
  @IsISO8601()
  dateDebut?: string | null;

  @ApiProperty({ required: false, description: 'Expire à cette date. Absent = sans terme.' })
  @IsOptional()
  @IsISO8601()
  dateFin?: string | null;
}

export class CreateProfilDto {
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
  @IsString()
  description?: string;

  @ApiProperty({ default: true })
  @IsOptional()
  @IsBoolean()
  estActif?: boolean;
}

export class UpdateProfilDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  code?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  libelle?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  estActif?: boolean;
}
