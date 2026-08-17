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

  /**
   * Nom du propriétaire, résolu par le serveur : « Direction Usine » ou
   * « Ange Madou » selon le type. NON PERSISTÉ — le lien est polymorphe,
   * aucune jointure ne couvre les deux tables à la fois.
   */
  @ApiProperty({ required: false, description: 'Nom du propriétaire (utilisateur ou direction)' })
  proprietaireLibelle?: string | null;

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

  /**
   * Raison du dernier réajustement MANQUÉ (migration 0072). Effacée dès qu'un
   * réajustement réussit : ce qui s'y trouve est toujours la raison actuelle.
   *
   * Sans elle, un portefeuille restait à 0 face à un budget d'un milliard sans
   * la moindre explication — l'échec ne vivait que dans le journal du serveur.
   */
  @ApiProperty({ required: false, description: 'Pourquoi le dernier réajustement mensuel a échoué' })
  @Column({ name: 'budget_reset_erreur', type: 'nvarchar', length: 500, nullable: true })
  budgetResetErreur?: string | null;

  @ApiProperty({ required: false, description: 'Quand le réajustement a été tenté pour la dernière fois' })
  @Column({ name: 'budget_reset_tente_le', type: 'datetime2', precision: 3, nullable: true })
  budgetResetTenteLe?: Date | null;

  /**
   * Portefeuille principal de sa caisse (migration 0073). UN SEUL par caisse,
   * garanti par un index unique filtré — l'écran n'est pas le seul garde-fou.
   *
   * Ne change aucun flux d'argent : c'est une désignation, pas un circuit. Elle
   * sert à proposer le bon portefeuille par défaut plutôt qu'à faire chercher
   * dans une liste où six portefeuilles de direction se ressemblent.
   */
  @ApiProperty({ default: false, description: 'Portefeuille principal de sa caisse (un seul par caisse)' })
  @Column({ name: 'est_principal', type: 'bit', default: false })
  estPrincipal!: boolean;

  @ApiProperty({ default: true })
  @Column({ name: 'est_actif', type: 'bit', default: true })
  estActif!: boolean;
}
