import { IsString, IsOptional, IsNotEmpty, IsDateString, IsBoolean } from 'class-validator';
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

  /**
   * Copier TOUS les droits de l'initiateur au lieu d'en désigner un seul.
   *
   * Le remplaçant reçoit alors un intérim par rôle et par profil détenu — pas
   * une délégation « globale » qui suivrait l'initiateur : ce qui est copié est
   * FIGÉ à la déclaration. Si l'initiateur gagne un rôle pendant son absence,
   * le remplaçant ne l'hérite pas.
   */
  @ApiProperty({
    required: false,
    description: "Copier tous les rôles et profils de l'initiateur",
  })
  @IsOptional()
  @IsBoolean()
  copierTousLesDroits?: boolean;

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
