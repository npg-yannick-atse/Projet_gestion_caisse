import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateDemandeRechargeDto {
  @ApiProperty({ description: 'Montant demandé (DECIMAL 19,4)' })
  @IsNotEmpty()
  @IsString()
  @Matches(/^\d+(\.\d{1,4})?$/, { message: 'Montant invalide' })
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
  @Matches(/^\d+(\.\d{1,4})?$/, { message: 'Montant invalide' })
  montant?: string;
}

export class RejeterDemandeRechargeDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  commentaire?: string;
}
