import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsNumberString, IsOptional, IsString, Min, MaxLength } from 'class-validator';

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
