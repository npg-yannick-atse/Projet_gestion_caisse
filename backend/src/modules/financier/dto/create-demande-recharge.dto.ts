import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { IsMontant } from '@common/validators/montant.validator';

export class CreateDemandeRechargeDto {
  @ApiProperty({ description: 'Montant demandé (DECIMAL 19,4)' })
  @IsNotEmpty()
  @IsString()
  @IsMontant()
  montant!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  motif?: string;

  @ApiProperty({
    required: false,
    description:
      "Portefeuille cible. Optionnel s'il n'y en a qu'un ; obligatoire si l'utilisateur en a plusieurs.",
  })
  @IsOptional()
  @IsString()
  portefeuilleId?: string;
}

export class TraiterDemandeRechargeDto {
  @ApiProperty({ required: false, description: 'Montant réellement rechargé (défaut = montant demandé)' })
  @IsOptional()
  @IsString()
  @IsMontant()
  montant?: string;
}

export class RejeterDemandeRechargeDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  commentaire?: string;
}
