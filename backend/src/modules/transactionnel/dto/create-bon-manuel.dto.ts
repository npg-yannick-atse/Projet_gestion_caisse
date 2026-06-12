import { IsInt, IsNotEmpty, IsNumberString, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateBonManuelDto {
  @ApiProperty({ description: 'Carnet ACTIF utilisé' })
  @IsNotEmpty()
  @IsNumberString()
  carnetId!: string;

  @ApiProperty({ description: 'Numéro du bon dans le carnet (ex. 1023)' })
  @IsInt()
  @Min(0)
  numeroManuel!: number;

  @ApiProperty({ description: 'Portefeuille débité (la caisse et la devise en sont déduites)' })
  @IsNotEmpty()
  @IsNumberString()
  portefeuilleId!: string;

  @ApiProperty({ description: 'Montant décaissé', example: '50000' })
  @IsNotEmpty()
  @IsNumberString()
  montant!: string;

  // --- Mêmes informations qu'un bon normal ---
  @ApiProperty({ description: 'Type de bon' })
  @IsNotEmpty()
  @IsNumberString()
  typeBonId!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  libelle!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumberString()
  partenaireId?: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  numeroBl!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  codeManutention!: string;

  @ApiProperty({ description: 'Centre de coût' })
  @IsNotEmpty()
  @IsNumberString()
  costCenterId!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  numeroClient?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ required: false, description: "Donneur d'ordre — utilisateur du système" })
  @IsOptional()
  @IsNumberString()
  donneurOrdreUserId?: string;

  @ApiProperty({ required: false, description: "Donneur d'ordre — nom libre (si non utilisateur)" })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  donneurOrdreNom?: string;

  @ApiProperty({ description: 'Bénéficiaire : personne qui a retiré' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  beneficiaireNom!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  motif?: string;
}
