import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Solde d'une session de caisse, POUR UNE DEVISE.
 *
 * Une caisse peut détenir plusieurs devises : enregistrer un solde unique à la
 * clôture reviendrait à additionner des dollars et des euros. Cette table porte
 * donc une ligne par devise réellement présente dans la caisse.
 *
 * Table sans colonnes d'audit complètes (pas d'AuditableEntity) : c'est une
 * ligne de détail, immuable, rattachée à la session qui porte déjà la
 * traçabilité (qui a clôturé, quand, comment).
 */
@Entity({ name: 'fin_session_caisse_devise' })
export class SessionCaisseDevise {
  @ApiProperty()
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @ApiProperty()
  @Column({ name: 'session_id', type: 'bigint' })
  sessionId!: string;

  @ApiProperty()
  @Column({ name: 'devise_id', type: 'bigint' })
  deviseId!: string;

  @ApiProperty({ description: "Solde de cette devise à l'ouverture de la session" })
  @Column({ name: 'solde_ouverture', type: 'decimal', precision: 19, scale: 4 })
  soldeOuverture!: string;

  @ApiProperty({ required: false, description: 'Solde de cette devise à la clôture' })
  @Column({ name: 'solde_cloture', type: 'decimal', precision: 19, scale: 4, nullable: true })
  soldeCloture?: string | null;

  @ApiProperty()
  @CreateDateColumn({ name: 'created_at', type: 'datetime2', precision: 3 })
  createdAt!: Date;
}
