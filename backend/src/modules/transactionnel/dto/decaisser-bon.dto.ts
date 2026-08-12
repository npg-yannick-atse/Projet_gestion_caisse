import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Décaissement d'un bon : à qui l'argent est remis.
 *
 * Le corps de la requête n'était typé qu'en ligne, sans aucune validation. Un
 * appel sans bénéficiaire traversait donc l'autorisation, ouvrait la
 * transaction, et n'échouait qu'au moment de l'INSERT :
 *
 *   « Cannot insert the value NULL into column 'beneficiaire_nom' »
 *
 * Constaté le 12/08/2026 lors du test de la matrice des rôles, où les comptes
 * CAISSIER et ADMINISTRATEUR — seuls à détenir BON_DECAISSER — atteignaient la
 * base avec un corps vide.
 *
 * Le bénéficiaire n'est pas une formalité : c'est la trace de QUI a reçu
 * l'argent, la seule pièce qui rattache une sortie de caisse à une personne.
 */
export class DecaisserBonDto {
  @ApiProperty({ description: "Nom de la personne à qui l'argent est remis." })
  @IsNotEmpty({ message: 'Le bénéficiaire est obligatoire : indiquez qui reçoit l’argent.' })
  @IsString()
  @MaxLength(255)
  beneficiaire!: string;

  @ApiProperty({ required: false, description: "Pièce d'identité présentée par le bénéficiaire." })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  beneficiairePiece?: string;

  @ApiProperty({
    required: false,
    description: 'Ajustements de dernière minute sur les sous-bons, par identifiant.',
  })
  @IsOptional()
  modifications?: Record<string, unknown>;
}
