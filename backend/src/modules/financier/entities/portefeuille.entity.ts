import { Entity, Column } from 'typeorm';
import { decimalToString } from '@common/transformers/decimal.transformer';
import { ApiProperty } from '@nestjs/swagger';
import { AuditableEntity } from '@common/entities/base.entity';

export type ProprietaireType = 'USER' | 'DIRECTION';

@Entity({ name: 'fin_portefeuille' })
export class Portefeuille extends AuditableEntity {
  @ApiProperty()
  @Column({ type: 'uniqueidentifier', generated: 'uuid' })
  uuid!: string;

  @ApiProperty()
  @Column({ type: 'nvarchar', length: 50, unique: true })
  code!: string;

  @ApiProperty()
  @Column({ type: 'nvarchar', length: 200 })
  libelle!: string;

  @Column({ name: 'caisse_source_id', type: 'bigint' })
  caisseSourceId!: string;

  @Column({ name: 'devise_id', type: 'bigint' })
  deviseId!: string;

  @Column({ name: 'site_id', type: 'bigint', nullable: true })
  siteId?: string | null;

  @ApiProperty({ enum: ['USER', 'DIRECTION'] })
  @Column({ name: 'proprietaire_type', type: 'nvarchar', length: 20 })
  proprietaireType!: ProprietaireType;

  @Column({ name: 'proprietaire_id', type: 'bigint' })
  proprietaireId!: string;

  @ApiProperty({ required: false, description: 'Utilisateur qui pilote ce portefeuille (gestionnaire)' })
  @Column({ name: 'gestionnaire_id', type: 'bigint', nullable: true })
  gestionnaireId?: string | null;

  @ApiProperty({ default: 0 })
  @Column({ name: 'solde_initial', type: 'decimal', precision: 19, scale: 4, transformer: decimalToString, default: 0 })
  soldeInitial!: string;

  @ApiProperty({
    required: false,
    description:
      'Plafond budgétaire MENSUEL (DECIMAL). Si défini, le portefeuille est réajusté à ce montant au début de chaque mois (pas de report du reliquat). Null = pas de plafond mensuel.',
  })
  @Column({ name: 'budget_mensuel', type: 'decimal', precision: 19, scale: 4, transformer: decimalToString, nullable: true })
  budgetMensuel?: string | null;

  @ApiProperty({ required: false, description: 'Dernier mois (YYYY-MM) où le budget mensuel a été réinitialisé (idempotence du job).' })
  @Column({ name: 'budget_reset_mois', type: 'nvarchar', length: 7, nullable: true })
  budgetResetMois?: string | null;

  @ApiProperty({ default: true })
  @Column({ name: 'est_actif', type: 'bit', default: true })
  estActif!: boolean;
}
