import { ArrayUnique, IsArray, IsIn, IsNumberString, IsOptional } from 'class-validator';
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

/**
 * Mode de recopie des droits d'un utilisateur vers un autre.
 *
 * REMPLACER : la cible devient exactement la source — une recrue au même poste.
 * AJOUTER   : les droits s'additionnent — un remplaçant qui doit continuer son
 *             propre travail pendant qu'il couvre un absent.
 */
export class ClonageDroitsDto {
  @ApiProperty({ required: false, enum: ['REMPLACER', 'AJOUTER'], default: 'REMPLACER' })
  @IsOptional()
  @IsIn(['REMPLACER', 'AJOUTER'])
  mode?: 'REMPLACER' | 'AJOUTER';
}
