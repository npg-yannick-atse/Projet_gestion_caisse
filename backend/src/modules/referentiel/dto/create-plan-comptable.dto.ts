import { IsIn, IsNotEmpty, IsNumberString, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export const TYPE_COMPTE = ['ACTIF', 'PASSIF', 'CHARGE', 'PRODUIT'] as const;
export type TypeCompte = (typeof TYPE_COMPTE)[number];

export class CreatePlanComptableDto {
  @ApiProperty({ description: 'Numéro / code du compte (ex. 401, 411, 512100)' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  numeroCompte!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  @MaxLength(200)
  libelle!: string;

  @ApiProperty({ enum: TYPE_COMPTE, description: 'Nature du compte' })
  @IsIn(TYPE_COMPTE as unknown as string[])
  typeCompte!: TypeCompte;

  @ApiProperty({ required: false, description: 'Compte parent (hiérarchie)' })
  @IsOptional()
  @IsNumberString()
  parentId?: string;
}
