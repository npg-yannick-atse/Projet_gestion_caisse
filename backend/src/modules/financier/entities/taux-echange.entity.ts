import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { decimalToString } from '@common/transformers/decimal.transformer';
import { ApiProperty } from '@nestjs/swagger';
import { AuditableEntity } from '@common/entities/base.entity';
import { Devise } from './devise.entity';

/**
 * D'où vient le taux.
 *   MANUEL : saisi dans l'application.
 *   SAP    : rapatrié de TCURR via BAPI_EXCHANGERATE_GETDETAIL.
 *   API    : fourni par un service de cotation externe.
 */
export type SourceTaux = 'MANUEL' | 'SAP' | 'API';

/**
 * Un taux de change sur une PÉRIODE, entre deux devises.
 *
 * Modèle d'historique, comme le salaire et les bénéfices : une correction ne
 * réécrit rien, elle clôt la période en cours et en ouvre une nouvelle. Une
 * opération de juin reste ainsi convertible au taux de juin.
 *
 * SENS : `taux` convertit la source VERS la cible —
 *        montantCible = montantSource × taux.
 *        Un seul sens est stocké par couple ; l'inverse est calculé (cf.
 *        TauxChangeService.convertir). Stocker les deux inviterait deux lignes à
 *        se contredire, 1/655,957 n'étant pas représentable exactement.
 *
 * Un index unique filtré (UQ_fin_te_couple_ouvert, migration 0055) garantit
 * qu'un couple n'a jamais deux périodes ouvertes à la fois.
 */
@Entity({ name: 'fin_taux_echange' })
export class TauxEchange extends AuditableEntity {
  @Column({ name: 'devise_source_id', type: 'bigint' })
  deviseSourceId!: string;

  @ManyToOne(() => Devise)
  @JoinColumn({ name: 'devise_source_id' })
  deviseSource?: Devise;

  @Column({ name: 'devise_cible_id', type: 'bigint' })
  deviseCibleId!: string;

  @ManyToOne(() => Devise)
  @JoinColumn({ name: 'devise_cible_id' })
  deviseCible?: Devise;

  @ApiProperty({ description: 'montantCible = montantSource × taux' })
  @Column({ type: 'decimal', precision: 19, scale: 8, transformer: decimalToString })
  taux!: string;

  @ApiProperty()
  @Column({ name: 'date_validite_debut', type: 'datetime2', precision: 3 })
  dateValiditeDebut!: Date;

  @ApiProperty({ required: false, description: 'null = taux encore en vigueur' })
  @Column({ name: 'date_validite_fin', type: 'datetime2', precision: 3, nullable: true })
  dateValiditeFin?: Date | null;

  @ApiProperty({ enum: ['MANUEL', 'SAP', 'API'] })
  @Column({ type: 'nvarchar', length: 20 })
  source!: SourceTaux;

  @ApiProperty({ required: false, description: 'Pourquoi ce taux a été saisi ou corrigé' })
  @Column({ type: 'nvarchar', length: 200, nullable: true })
  motif?: string | null;

  /**
   * Parité fixée par accord monétaire (EUR → XOF = 655,957), et non cotation de
   * marché. L'import automatique n'y touche pas : il la remplacerait par du
   * bruit quotidien autour de la vraie valeur.
   */
  @ApiProperty({ default: false, description: 'Parité fixe : intouchable par l’import automatique' })
  @Column({ name: 'parite_fixe', type: 'bit', default: false })
  pariteFixe!: boolean;
}
