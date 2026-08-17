import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';
import { decimalToString } from '@common/transformers/decimal.transformer';

export type TypeOperation =
  | 'RECHARGE'
  | 'DECAISSEMENT'
  | 'TRANSFERT'
  | 'AJUSTEMENT'
  /** Entrée d'argent dans une caisse (client, dotation…). Miroir du décaissement. */
  | 'ENCAISSEMENT'
  /** Décaissement d'un crédit accordé à un employé. */
  | 'CREDIT'
  /** Versement du salaire d'un employé depuis une caisse ou un portefeuille. */
  | 'SALAIRE'
  /** Mensualité d'un crédit employé encaissée : l'argent revient dans la source. */
  | 'REMBOURSEMENT_CREDIT'
  /** Part non dépensée d'un bon, rendue à la caisse (migration 0074). */
  | 'REMBOURSEMENT_BON';

@Entity({ name: 'trx_operation' })
export class Operation {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'transaction_uuid', type: 'uniqueidentifier' })
  transactionUuid!: string;

  @Column({ name: 'type_operation', type: 'nvarchar', length: 20 })
  typeOperation!: TypeOperation;

  @Column({ name: 'caisse_id', type: 'bigint', nullable: true })
  caisseId?: string | null;

  @Column({ name: 'portefeuille_id', type: 'bigint', nullable: true })
  portefeuilleId?: string | null;

  @Column({ type: 'decimal', precision: 19, scale: 4, transformer: decimalToString })
  montant!: string;

  @Column({ name: 'devise_id', type: 'bigint' })
  deviseId!: string;

  /**
   * Taux RÉELLEMENT appliqué à cette opération, et ce qu'elle a valu.
   *
   * À ne pas confondre avec `fin_taux_echange`, qui donne le cours du JOUR :
   * celui-ci est une estimation, ceux-ci sont un fait. Deux encaissements du
   * même jour peuvent porter deux taux différents — c'est précisément la raison
   * d'être de ces colonnes (migration 0057).
   *
   * `null` = pas de conversion à décrire : opération déjà dans la devise de
   * référence, ou antérieure à la migration. La consolidation retombe alors sur
   * le cours du jour.
   *
   * Les trois vont ensemble (CK_trx_op_conversion_complete).
   */
  @Column({ name: 'taux_applique', type: 'decimal', precision: 19, scale: 8, transformer: decimalToString, nullable: true })
  tauxApplique?: string | null;

  /** Montant × taux, figé au moment de l'opération — l'arrondi du jour est un fait. */
  @Column({ name: 'contre_valeur', type: 'decimal', precision: 19, scale: 4, transformer: decimalToString, nullable: true })
  contreValeur?: string | null;

  /** Devise de `contre_valeur`. Stockée car DEVISE_REFERENCE est modifiable. */
  @Column({ name: 'devise_contre_valeur_id', type: 'bigint', nullable: true })
  deviseContreValeurId?: string | null;

  @Column({ name: 'date_operation', type: 'datetime2', precision: 3 })
  dateOperation!: Date;

  @Column({ name: 'user_id', type: 'bigint' })
  userId!: string;

  @Column({ type: 'nvarchar', length: 100, nullable: true })
  reference?: string | null;

  /**
   * Bon et sous-bon payés par ce décaissement, résolus par le serveur.
   * NON PERSISTÉS : la référence stockée est technique (« BC-26 »), elle désigne
   * le bon de caisse et ne dit pas quel bon il règle.
   */
  bonNumero?: string | null;

  numeroSousBon?: number | null;

  // Renseignés pour les encaissements (nullable pour les autres opérations).
  @Column({ name: 'client_nom', type: 'nvarchar', length: 200, nullable: true })
  clientNom?: string | null;

  @Column({ name: 'client_numero', type: 'nvarchar', length: 50, nullable: true })
  clientNumero?: string | null;

  @Column({ type: 'nvarchar', length: 200, nullable: true })
  motif?: string | null;

  /* -------- Intégration SAP (envoi comptable, idempotence) -------- */

  @Column({ name: 'sap_piece', type: 'nvarchar', length: 20, nullable: true })
  sapPiece?: string | null;

  @Column({ name: 'sap_statut', type: 'nvarchar', length: 20, nullable: true })
  sapStatut?: string | null; // ENVOYE / ERREUR

  @Column({ name: 'sap_date', type: 'datetime2', precision: 3, nullable: true })
  sapDate?: Date | null;

  @Column({ name: 'sap_message', type: 'nvarchar', length: 500, nullable: true })
  sapMessage?: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime2', precision: 3 })
  createdAt!: Date;
}
