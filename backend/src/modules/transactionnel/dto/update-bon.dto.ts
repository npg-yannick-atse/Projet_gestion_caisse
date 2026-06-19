import {
  IsOptional,
  IsNumberString,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Modification d'un bon (enveloppe). Seuls les champs portés par le bon lui-même
 * sont modifiables ici ; le cœur métier (montants, libellés…) vit sur les sous-bons
 * et se modifie via UpdateSousBonDto. Réservé au statut CREE.
 */
export class UpdateBonDto {
  @ApiProperty({ required: false, description: 'Personne qui se présentera à la caisse (texte libre). Chaîne vide => efface.' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  porteur?: string;
}

/**
 * Modification d'un sous-bon (cœur métier). Les axes d'imputation comptable
 * (caisse, portefeuille, cost-center, nature, devise) restent immuables :
 * les modifier reviendrait à changer le périmètre/cloisonnement du bon.
 * Réservé au statut CREE. Tout champ omis (undefined) est laissé inchangé.
 */
export class UpdateSousBonDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  libelle?: string;

  @ApiProperty({ required: false, description: 'Montant DECIMAL(19,4) en string (> 0)' })
  @IsOptional()
  @IsNumberString()
  montant?: string;

  @ApiProperty({ required: false, description: 'Chaîne vide => efface' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false, description: 'Id du partenaire ; null/vide => efface' })
  @IsOptional()
  @IsNumberString()
  partenaireId?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  numeroBl?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  codeManutention?: string;

  @ApiProperty({ required: false, description: 'Numéro client ; null/vide => efface' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  numeroClient?: string | null;
}
