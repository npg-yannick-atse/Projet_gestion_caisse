import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsMontant } from '@common/validators/montant.validator';

/** Modes de détermination du montant d'un bénéfice. */
export const MODES_MONTANT_BENEFICE = ['SAISI', 'FIXE', 'POURCENTAGE_SALAIRE'] as const;
export type ModeMontantBeneficeDto = (typeof MODES_MONTANT_BENEFICE)[number];

/** Modes de règlement d'un employé. */
export const MODES_REGLEMENT = ['ESPECES', 'VIREMENT'] as const;
export type ModeReglementDto = (typeof MODES_REGLEMENT)[number];

export class CreateEmployeDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  matricule!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  @MaxLength(150)
  nom!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  @MaxLength(200)
  prenoms!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumberString()
  directionId?: string;

  @ApiProperty({ required: false, description: 'Salaire — DECIMAL(19,4) en string' })
  @IsOptional()
  @IsMontant()
  salaire?: string;

  @ApiProperty({ required: false, enum: MODES_REGLEMENT })
  @IsOptional()
  @IsIn(MODES_REGLEMENT)
  modeReglement?: ModeReglementDto;

  @ApiProperty({ required: false, description: 'Banque (mode VIREMENT)' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  banque?: string | null;

  @ApiProperty({ required: false, description: 'RIB / n° de compte (mode VIREMENT)' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  rib?: string | null;

  @ApiProperty({ required: false, description: 'Portefeuille source par défaut' })
  @IsOptional()
  @IsNumberString()
  portefeuilleSourceId?: string | null;
}

export class UpdateEmployeDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  nom?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  prenoms?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumberString()
  directionId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsMontant()
  salaire?: string;

  @ApiProperty({ required: false, enum: MODES_REGLEMENT })
  @IsOptional()
  @IsIn(MODES_REGLEMENT)
  modeReglement?: ModeReglementDto;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  banque?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  rib?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumberString()
  portefeuilleSourceId?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  estActif?: boolean;
}

/**
 * Réglages du « mode d'attribution » d'un type de bénéfice. Mutualisés entre
 * création et mise à jour (tous optionnels côté update).
 */
export class TypeBeneficeConfigDto {
  @ApiProperty({ required: false, enum: MODES_MONTANT_BENEFICE })
  @IsOptional()
  @IsIn(MODES_MONTANT_BENEFICE)
  modeMontant?: ModeMontantBeneficeDto;

  @ApiProperty({ required: false, description: 'Montant imposé (mode FIXE)' })
  @IsOptional()
  @IsMontant()
  montantFixe?: string | null;

  @ApiProperty({ required: false, description: '% du salaire (mode POURCENTAGE_SALAIRE)' })
  @IsOptional()
  @IsNumberString()
  pourcentageSalaire?: string | null;

  @ApiProperty({ required: false, description: 'Plafond en % du salaire' })
  @IsOptional()
  @IsNumberString()
  plafondPourcentageSalaire?: string | null;

  @ApiProperty({ required: false, description: 'Jour minimum du mois (1–31)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  jourMinMois?: number | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  requiertPeriode?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  recurrent?: boolean;
}

export class CreateTypeBeneficeDto extends TypeBeneficeConfigDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  code!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  @MaxLength(200)
  libelle!: string;
}

export class UpdateTypeBeneficeDto extends TypeBeneficeConfigDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  libelle?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  estActif?: boolean;
}

export class CreateEmployeBeneficeDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsNumberString()
  typeBeneficeId!: string;

  // Montant et dates sont validés/complétés côté service SELON le mode
  // d'attribution du type choisi (montant fixe/calculé, période requise ou non).
  @ApiProperty({ required: false, description: 'Montant — requis seulement si le type est en mode SAISI' })
  @IsOptional()
  @IsMontant()
  montant?: string;

  @ApiProperty({ required: false, description: 'Début de validité (AAAA-MM-JJ) — requis si le type a une période' })
  @IsOptional()
  @IsDateString()
  dateDebut?: string;

  @ApiProperty({ required: false, description: 'Fin de validité (AAAA-MM-JJ) — requis si le type a une période' })
  @IsOptional()
  @IsDateString()
  dateFin?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  commentaire?: string;
}

export class UpdateEmployeBeneficeDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsMontant()
  montant?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  dateDebut?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  dateFin?: string;

  @ApiProperty({ required: false, description: 'Passer à false libère le type pour un nouveau bénéfice.' })
  @IsOptional()
  @IsBoolean()
  estValide?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  commentaire?: string;
}

/**
 * Changement de salaire : ouvre une nouvelle période à compter de `dateDebut`
 * et clôt la précédente la veille. Le passé n'est jamais réécrit.
 */
export class ChangerSalaireDto {
  @ApiProperty({ description: 'Nouveau salaire. DECIMAL(19,4) en string.' })
  @IsNotEmpty()
  @IsMontant()
  montant!: string;

  @ApiProperty({ description: "Premier jour de validité (AAAA-MM-JJ)." })
  @IsNotEmpty()
  @IsDateString()
  dateDebut!: string;

  @ApiProperty({ required: false, description: 'Augmentation, réduction, régularisation…' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  motif?: string;
}
