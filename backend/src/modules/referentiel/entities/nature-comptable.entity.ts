import { Entity, Column } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { AuditableEntity } from '@common/entities/base.entity';

@Entity({ name: 'ref_nature_comptable' })
export class NatureComptable extends AuditableEntity {
  @ApiProperty()
  @Column({ type: 'nvarchar', length: 200, unique: true })
  libelle!: string;

  @ApiProperty({ required: false })
  @Column({ type: 'nvarchar', length: 'MAX', nullable: true })
  description?: string | null;

  @Column({ name: 'cost_center_id', type: 'bigint', nullable: true })
  costCenterId?: string | null;

  @Column({ name: 'plan_comptable_id', type: 'bigint', nullable: true })
  planComptableId?: string | null;

  @ApiProperty({ required: false })
  @Column({ name: 'code_comptable_sap', type: 'nvarchar', length: 50, nullable: true })
  codeComptableSap?: string | null;

  /**
   * Le code d'une nature comptable EST son compte SAP.
   *
   * Exposé sous ce nom parce que tous les écrans — web et mobile — affichent
   * « code — libellé » depuis que ces natures s'appelaient « natures
   * d'opération » (migration 0070). Renommer le champ côté client aurait touché
   * une quinzaine de fichiers pour la même valeur.
   */
  @ApiProperty({ required: false, description: 'Alias de codeComptableSap' })
  get code(): string {
    return this.codeComptableSap ?? '';
  }

  /**
   * Utilisable comme imputation d'un sous-bon.
   *
   * Le plan comptable en compte 599 ; 180 seulement servent aux bons. Ce
   * drapeau remplace la table `ref_nature_operation`, qui n'était que la liste
   * de ces 180 (migration 0070). Sans lui, un demandeur choisirait parmi tout
   * le plan comptable.
   */
  @ApiProperty({ default: false })
  @Column({ name: 'utilisable_bon', type: 'bit', default: false })
  utilisableBon!: boolean;

  @ApiProperty({ default: true })
  @Column({ name: 'est_actif', type: 'bit', default: true })
  estActif!: boolean;

  /** Centres de coût rattachés — compté par le serveur, non persisté. */
  nbCostCenters?: number;
}
