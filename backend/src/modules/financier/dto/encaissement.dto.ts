import { IsNotEmpty, IsOptional, IsNumberString, IsString, MaxLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsMontant } from '@common/validators/montant.validator';
import { IsTaux } from '@common/validators/taux.validator';
import { RequisAvec } from '@common/validators/requis-avec.validator';

export class EncaissementDto {
  @ApiProperty({ description: 'Caisse qui reçoit l\'argent (doit être OUVERTE)' })
  @IsNotEmpty()
  @IsNumberString()
  caisseId!: string;

  @ApiProperty({ description: 'Montant encaissé. DECIMAL(19,4) en string.', example: '100000.0000' })
  @IsNotEmpty()
  @IsMontant()
  montant!: string;

  @ApiProperty({
    required: false,
    description:
      "Devise reçue. Par défaut, la devise déclarée de la caisse — une caisse peut " +
      "en détenir plusieurs.",
  })
  @IsOptional()
  @IsNumberString()
  deviseId?: string;

  @ApiProperty({
    required: false,
    description:
      "Taux RÉELLEMENT obtenu, quand la devise n'est pas celle de référence. L'écran le " +
      'pré-remplit avec le cours du jour et le caissier le corrige si besoin. Absent = non ' +
      'renseigné : rien n’est figé, la consolidation retombera sur le cours du jour.',
    example: '590.00000000',
  })
  @IsOptional()
  @IsTaux()
  tauxApplique?: string;

  @ApiProperty({
    required: false,
    description:
      "Nom du client qui paie. Ne peut être renseigné qu'avec son code client : " +
      'il découle du client choisi dans le référentiel, il ne se saisit pas librement.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @RequisAvec(
    'clientNumero',
    "Choisissez le client dans la liste : un nom de client ne peut pas être enregistré sans son code client.",
  )
  clientNom?: string;

  @ApiProperty({ required: false, description: 'Numéro / identifiant du client' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  // Le numéro client est un identifiant SAP (KUNNR) : chiffres uniquement.
  // Chaîne vide tolérée = champ non renseigné.
  @Matches(/^[0-9]*$/, { message: 'Le numéro client ne doit contenir que des chiffres.' })
  clientNumero?: string;

  @ApiProperty({ required: false, description: 'Motif / provenance (dotation, banque, règlement...)' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  motif?: string;

  @ApiProperty({ required: false, description: 'Référence libre (n° pièce...)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string;
}
