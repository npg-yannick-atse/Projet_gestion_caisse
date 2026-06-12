import { Entity, Column } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { AuditableEntity } from '@common/entities/base.entity';

/**
 * Statuts du BonCaisse (copie de travail caissier).
 * PREPARE  : duplicata cree, en cours d'edition par le caissier
 * FINALISE : decaissement effectivement realise (operation+sous-bon DECAISSE)
 * ANNULE   : caissier a abandonne le decaissement avant finalisation
 */
export type BonCaisseStatut = 'PREPARE' | 'FINALISE' | 'ANNULE';

/**
 * trx_bon_caisse = copie de travail (snapshot) cree par le caissier au moment
 * du decaissement d'un sous-bon. Le caissier peut ajuster le beneficiaire,
 * le libelle et le montant avant de finaliser l'operation.
 *
 * Note : on persiste dans contenuModifie un JSON { original, modified, ... }
 * pour conserver l'audit complet (valeurs originales vs valeurs ajustees).
 */
@Entity({ name: 'trx_bon_caisse' })
export class BonCaisse extends AuditableEntity {
  @ApiProperty()
  @Column({ type: 'uniqueidentifier', generated: 'uuid' })
  uuid!: string;

  @Column({ name: 'bon_source_id', type: 'bigint', nullable: true })
  bonSourceId?: string | null;

  @Column({ name: 'sous_bon_source_id', type: 'bigint', nullable: true })
  sousBonSourceId?: string | null;

  @Column({ name: 'caissier_id', type: 'bigint' })
  caissierId!: string;

  @Column({ name: 'date_duplication', type: 'datetime2', precision: 3 })
  dateDuplication!: Date;

  @ApiProperty({ required: false, description: 'Date de finalisation effective du decaissement' })
  @Column({ name: 'date_decaissement', type: 'datetime2', precision: 3, nullable: true })
  dateDecaissement?: Date | null;

  @ApiProperty({ required: false, description: 'JSON { original, modified, ... } pour audit' })
  @Column({ name: 'contenu_modifie', type: 'nvarchar', length: 'MAX', nullable: true })
  contenuModifie?: string | null;

  @ApiProperty({ required: false })
  @Column({ type: 'nvarchar', length: 255, nullable: true })
  beneficiaire?: string | null;

  @ApiProperty({ required: false })
  @Column({ name: 'beneficiaire_piece', type: 'nvarchar', length: 100, nullable: true })
  beneficiairePiece?: string | null;

  @ApiProperty({ required: false, description: 'Surcharge du libelle du sous-bon par le caissier' })
  @Column({ name: 'libelle_ajuste', type: 'nvarchar', length: 255, nullable: true })
  libelleAjuste?: string | null;

  @ApiProperty({ required: false, description: 'Surcharge du montant du sous-bon par le caissier' })
  @Column({ name: 'montant_ajuste', type: 'decimal', precision: 19, scale: 4, nullable: true })
  montantAjuste?: string | null;

  @ApiProperty({ required: false })
  @Column({ type: 'nvarchar', length: 500, nullable: true })
  commentaire?: string | null;

  @ApiProperty({ enum: ['PREPARE', 'FINALISE', 'ANNULE'], default: 'PREPARE' })
  @Column({ type: 'nvarchar', length: 20, default: 'PREPARE' })
  statut!: BonCaisseStatut;
}
