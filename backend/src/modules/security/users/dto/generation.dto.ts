import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Code et libellé du nouvel objet. Ils ne sont PAS déduits de la source : deux
 * copies d'un même rôle doivent pouvoir coexister, et un code se choisit — il
 * sert d'identité durable, pas de sous-produit.
 */
export class GenerationDto {
  @ApiProperty({ description: 'Code du nouvel objet' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  code!: string;

  @ApiProperty({ description: 'Libellé du nouvel objet' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(200)
  libelle!: string;
}
