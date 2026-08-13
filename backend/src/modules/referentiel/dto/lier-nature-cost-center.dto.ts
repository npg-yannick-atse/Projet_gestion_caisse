import { ArrayUnique, IsArray, IsNumberString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * On envoie la SÉLECTION COMPLÈTE, pas un ajout ou un retrait unitaire.
 *
 * L'écran présente des cases à cocher : transmettre l'ensemble voulu évite
 * qu'un clic perdu en chemin laisse la base et l'écran en désaccord. Un tableau
 * vide est une valeur légitime — elle signifie « plus aucun lien ».
 */
export class LierCostCentersDto {
  @ApiProperty({ type: [String], description: 'Ensemble complet des centres de coût voulus' })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsNumberString({}, { each: true })
  costCenterIds?: string[];
}

export class LierNaturesDto {
  @ApiProperty({ type: [String], description: 'Ensemble complet des natures comptables voulues' })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsNumberString({}, { each: true })
  natureComptableIds?: string[];
}

/** Même contrat, côté natures d'opération — celles que l'écran nomme « natures comptables ». */
export class LierNaturesOperationDto {
  @ApiProperty({ type: [String], description: 'Ensemble complet des natures voulues' })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsNumberString({}, { each: true })
  natureOperationIds?: string[];
}
