import { Entity, Column } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { decimalToString } from '@common/transformers/decimal.transformer';
import { AuditableEntity } from '@common/entities/base.entity';

export type CreditStatut =
  | 'EN_ATTENTE'
  | 'APPROUVEE'
  | 'EN_COURS'
  | 'SOLDE'
  | 'REJETEE'
  | 'ANNULEE';
export type CreditSource = 'CAISSE' | 'PORTEFEUILLE';
/** Traitement du reliquat d'une mensualité partiellement prélevée. */
export type ModeReplanification = 'REPARTIR' | 'ALLONGER';

/**
 * Crédit accordé à un employé, via un WORKFLOW de validation :
 *   EN_ATTENTE (demande) → APPROUVEE (DAF) → EN_COURS (décaissé par caissier) → SOLDE
 *   ↘ REJETEE (DAF)   ↘ ANNULEE (demandeur)
 * Le décaissement réel (opération CREDIT + écritures DÉBIT source / CRÉDIT créance)
 * n'a lieu qu'au passage EN_COURS. Un seul crédit ACTIF par employé (index unique
 * filtré UQ_fin_credit_actif, migration 0024). Pas de suivi de remboursement : la
 * mensualité (montant ÷ nbMois) et la date de fin sont calculées à l'affichage.
 */
@Entity({ name: 'fin_credit' })
export class Credit extends AuditableEntity {
  @ApiProperty()
  @Column({ name: 'employe_id', type: 'bigint' })
  employeId!: string;

  @ApiProperty()
  @Column({ type: 'decimal', precision: 19, scale: 4, transformer: decimalToString })
  montant!: string;

  @ApiProperty()
  @Column({ name: 'nb_mois', type: 'int' })
  nbMois!: number;

  @ApiProperty({ enum: ['CAISSE', 'PORTEFEUILLE'] })
  @Column({ name: 'source_type', type: 'nvarchar', length: 20 })
  sourceType!: CreditSource;

  @ApiProperty()
  @Column({ name: 'source_id', type: 'bigint' })
  sourceId!: string;

  @ApiProperty()
  @Column({ name: 'devise_id', type: 'bigint' })
  deviseId!: string;

  @ApiProperty({
    enum: ['EN_ATTENTE', 'APPROUVEE', 'EN_COURS', 'SOLDE', 'REJETEE', 'ANNULEE'],
    default: 'EN_ATTENTE',
  })
  @Column({ type: 'nvarchar', length: 20, default: 'EN_ATTENTE' })
  statut!: CreditStatut;

  @ApiProperty({ description: 'Date de début du prêt (fixée au décaissement)' })
  @Column({ name: 'date_debut', type: 'date' })
  dateDebut!: string;

  @ApiProperty({ required: false })
  @Column({ name: 'transaction_uuid', type: 'uniqueidentifier', nullable: true })
  transactionUuid?: string | null;

  @ApiProperty({ required: false })
  @Column({ type: 'nvarchar', length: 'MAX', nullable: true })
  commentaire?: string | null;

  // --- Workflow de validation ---
  @ApiProperty({ required: false, description: 'DAF ayant approuvé / rejeté' })
  @Column({ name: 'validateur_id', type: 'bigint', nullable: true })
  validateurId?: string | null;

  @Column({ name: 'date_validation', type: 'datetime2', precision: 3, nullable: true })
  dateValidation?: Date | null;

  @ApiProperty({ required: false, description: 'Motif de rejet (le cas échéant)' })
  @Column({ name: 'commentaire_validation', type: 'nvarchar', length: 500, nullable: true })
  commentaireValidation?: string | null;

  @ApiProperty({ required: false, description: 'Caissier ayant décaissé' })
  @Column({ name: 'decaisse_par_id', type: 'bigint', nullable: true })
  decaisseParId?: string | null;

  @Column({ name: 'date_decaissement', type: 'datetime2', precision: 3, nullable: true })
  dateDecaissement?: Date | null;

  // --- Prélèvement sur salaire ---
  /**
   * Autorisation, donnée UNE FOIS à l'approbation, de retenir les mensualités
   * sur le salaire. Tant qu'elle est fausse, la paie ne retient rien : on
   * n'ampute pas un salaire sans qu'un approbateur l'ait décidé.
   */
  @ApiProperty({ description: 'Les mensualités sont-elles prélevées sur le salaire ?' })
  @Column({ name: 'prelevement_salaire', type: 'bit', default: false })
  prelevementSalaire!: boolean;

  @ApiProperty({ required: false, description: 'Qui a autorisé le prélèvement sur salaire' })
  @Column({ name: 'prelevement_autorise_par_id', type: 'bigint', nullable: true })
  prelevementAutoriseParId?: string | null;

  @ApiProperty({ required: false })
  @Column({ name: 'prelevement_autorise_le', type: 'datetime2', precision: 3, nullable: true })
  prelevementAutoriseLe?: Date | null;

  /**
   * Que faire du reliquat quand une mensualité n'a pu être prélevée qu'en
   * partie. Choisi par le DAF à l'approbation.
   *
   *   REPARTIR  le reliquat est étalé sur les échéances restantes : la
   *             mensualité monte, la date de fin ne bouge pas.
   *   ALLONGER  la mensualité convenue est maintenue et des mois sont ajoutés :
   *             la date de fin recule.
   */
  @ApiProperty({ enum: ['REPARTIR', 'ALLONGER'], default: 'ALLONGER' })
  @Column({ name: 'mode_replanification', type: 'nvarchar', length: 20, default: 'ALLONGER' })
  modeReplanification!: ModeReplanification;

  /**
   * Mensualité convenue, figée. Indispensable au mode ALLONGER : `nbMois`
   * évoluant, un recalcul montant ÷ nbMois donnerait une mensualité qui baisse
   * à chaque allongement et le crédit ne se solderait jamais.
   */
  @ApiProperty({ required: false })
  @Column({
    name: 'mensualite_reference',
    type: 'decimal',
    precision: 19,
    scale: 4,
    transformer: decimalToString,
    nullable: true,
  })
  mensualiteReference?: string | null;

  /** Durée d'origine ; `nbMois` porte la durée courante, éventuellement allongée. */
  @ApiProperty({ required: false })
  @Column({ name: 'nb_mois_initial', type: 'int', nullable: true })
  nbMoisInitial?: number | null;
}
