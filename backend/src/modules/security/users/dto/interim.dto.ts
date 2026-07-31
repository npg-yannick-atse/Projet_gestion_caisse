import { IsString, IsOptional, IsNotEmpty, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateInterimDto {
  /**
   * Optionnel. Omis (ou égal à soi-même) : on déclare SON PROPRE intérim.
   * Renseigné avec un autre utilisateur : on déclare en son nom, ce qui exige la
   * permission INTERIM_DECLARER_TIERS (cf. interims.service.create).
   */
  @ApiProperty({ required: false, description: "Défaut : l'utilisateur authentifié" })
  @IsOptional()
  @IsString()
  initiateurId?: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  remplacantId!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  permissionId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  roleTransfereId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  profilTransfereId?: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsDateString()
  dateDebut!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsDateString()
  dateFin!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  commentaire?: string;
}

export class UpdateInterimDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  dateDebut?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  dateFin?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  commentaire?: string;

  @ApiProperty({ enum: ['ACTIF', 'EXPIRE', 'REVOQUE'], required: false })
  @IsOptional()
  @IsString()
  statut?: string;
}
