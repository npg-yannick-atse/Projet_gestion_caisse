import { IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateDeviseDto {
  /**
   * Code ISO 4217 : trois lettres majuscules. On l'impose plutôt que d'accepter
   * n'importe quoi, car ce code sert de clé de rapprochement avec SAP et avec
   * l'API de cotation — « fcfa » ou « Xof » ne s'y retrouveraient pas.
   */
  @ApiProperty({ example: 'GHS', description: 'Code ISO 4217 (3 lettres majuscules)' })
  @IsNotEmpty()
  @IsString()
  @Matches(/^[A-Z]{3}$/, { message: 'Le code doit être un code ISO de 3 lettres majuscules (ex. XOF, EUR, GHS).' })
  code!: string;

  @ApiProperty({ example: 'Cedi ghanéen' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  libelle!: string;

  @ApiProperty({ required: false, example: 'GH₵' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  symbole?: string;

  /**
   * Gouverne l'arrondi de TOUTES les conversions vers cette devise, et cet
   * arrondi est ensuite figé dans les écritures. Le franc CFA n'a pas de
   * centime : 0. L'euro et le dollar : 2.
   */
  @ApiProperty({ default: 2, description: 'Nombre de décimales (XOF = 0, EUR = 2)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(4)
  nbDecimales?: number;
}
