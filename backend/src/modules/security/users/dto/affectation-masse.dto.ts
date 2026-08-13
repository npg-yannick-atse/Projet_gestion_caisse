import { ArrayUnique, IsArray, IsNumberString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Sélection COMPLÈTE d'un périmètre (divisions, natures, centres de coût).
 *
 * On transmet l'ensemble voulu plutôt qu'un ajout ou un retrait : c'est ce que
 * montre l'écran — des cases à cocher — et cela évite qu'un appel perdu en
 * chemin laisse la base et l'affichage en désaccord.
 *
 * Un tableau vide est une valeur légitime : elle retire tout.
 */
export class AffectationEnMasseDto {
  @ApiProperty({ type: [String], description: 'Ensemble complet des identifiants voulus' })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsNumberString({}, { each: true })
  ids?: string[];
}
