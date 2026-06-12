import { IsString, IsOptional, IsBoolean, IsNotEmpty, MaxLength, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ProfilCategorie } from '../../entities/profil.entity';

export const PROFIL_CATEGORIES = ['VALIDATEUR', 'DEMANDEUR', 'CAISSIER', 'INTERIM'] as const;

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

  @ApiProperty({ enum: [...PROFIL_CATEGORIES] })
  @IsNotEmpty()
  @IsIn(PROFIL_CATEGORIES)
  categorie!: ProfilCategorie;

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

  @ApiProperty({ required: false, enum: [...PROFIL_CATEGORIES] })
  @IsOptional()
  @IsIn(PROFIL_CATEGORIES)
  categorie?: ProfilCategorie;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  estActif?: boolean;
}
