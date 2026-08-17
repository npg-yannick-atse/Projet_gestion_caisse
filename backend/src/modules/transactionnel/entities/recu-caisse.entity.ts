import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { decimalToString } from '@common/transformers/decimal.transformer';

/**
 * Reçu de réception : la pièce qui atteste qu'de l'argent est entré en caisse
 * (migration 0075).
 *
 * Toute SORTIE laissait un bon, imprimé et signé ; les entrées n'avaient rien.
 * Celui qui apporte n'avait rien à garder, le caissier rien à opposer.
 *
 * Émis par le grand livre au moment où une caisse est créditée — jamais saisi
 * à la main. Un reçu ne s'invente pas : il constate une écriture.
 */
@Entity({ name: 'trx_recu_caisse' })
export class RecuCaisse {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @ApiProperty({ example: 'REC-0001' })
  @Column({ type: 'nvarchar', length: 20 })
  numero!: string;

  @ApiProperty()
  @Column({ name: 'caisse_id', type: 'bigint' })
  caisseId!: string;

  @ApiProperty()
  @Column({ name: 'devise_id', type: 'bigint' })
  deviseId!: string;

  @ApiProperty()
  @Column({ type: 'decimal', precision: 19, scale: 4, transformer: decimalToString })
  montant!: string;

  @ApiProperty({ required: false, description: "Ce qui a fait entrer l'argent" })
  @Column({ name: 'type_entree', type: 'nvarchar', length: 40, nullable: true })
  typeEntree?: string | null;

  @ApiProperty()
  @Column({ name: 'transaction_uuid', type: 'uniqueidentifier' })
  transactionUuid!: string;

  @ApiProperty({ required: false })
  @Column({ name: 'remis_par', type: 'nvarchar', length: 255, nullable: true })
  remisPar?: string | null;

  @ApiProperty({ required: false })
  @Column({ type: 'nvarchar', length: 500, nullable: true })
  motif?: string | null;

  @ApiProperty()
  @CreateDateColumn({ name: 'created_at', type: 'datetime2', precision: 3 })
  createdAt!: Date;

  @ApiProperty({ required: false })
  @Column({ name: 'created_by_id', type: 'bigint', nullable: true })
  createdById?: string | null;

  /** Libellés résolus par le serveur — un reçu doit se lire seul. */
  @ApiProperty({ required: false })
  caisseLibelle?: string | null;

  @ApiProperty({ required: false })
  deviseCode?: string | null;

  @ApiProperty({ required: false })
  encaissePar?: string | null;
}
