import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsNumberString, IsOptional, IsString, Min, MaxLength } from 'class-validator';

export class CreateRemboursementDto {
  @ApiPropertyOptional({
    description: "Rang de l'échéance encaissée. Par défaut, la première non réglée.",
    minimum: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  numeroEcheance?: number;

  @ApiPropertyOptional({
    description: 'Montant versé. Par défaut, la mensualité théorique.',
  })
  @IsOptional()
  @IsNumberString({}, { message: 'Le montant doit être un nombre.' })
  montant?: string;

  @ApiPropertyOptional({
    description: "Compte où l'argent est encaissé. Par défaut, la source du crédit.",
    enum: ['CAISSE', 'PORTEFEUILLE'],
  })
  @IsOptional()
  @IsIn(['CAISSE', 'PORTEFEUILLE'])
  sourceType?: 'CAISSE' | 'PORTEFEUILLE';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sourceId?: string;

  @ApiPropertyOptional({ description: 'Date du versement (par défaut, maintenant)' })
  @IsOptional()
  @IsString()
  dateRemboursement?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(400)
  commentaire?: string;
}

export class AnnulerRemboursementDto {
  @ApiPropertyOptional({ description: "Motif de l'annulation, conservé dans le commentaire" })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  motif?: string;
}

export class ApprouverCreditDto {
  @ApiPropertyOptional({
    description:
      'Autorise, pour toute la durée du crédit, la retenue des mensualités sur le salaire. ' +
      "Décision prise une seule fois, ici : la paie ne sera pas bloquée chaque mois.",
  })
  @IsOptional()
  @IsBoolean()
  prelevementSalaire?: boolean;

  @ApiPropertyOptional({
    enum: ['REPARTIR', 'ALLONGER'],
    description:
      "Traitement d'un reliquat quand une mensualité n'a pu être prélevée qu'en partie. " +
      "ALLONGER (défaut) maintient la mensualité convenue et ajoute des mois ; " +
      "REPARTIR étale le reliquat sur les échéances restantes, durée inchangée.",
  })
  @IsOptional()
  @IsIn(['REPARTIR', 'ALLONGER'])
  modeReplanification?: 'REPARTIR' | 'ALLONGER';
}
