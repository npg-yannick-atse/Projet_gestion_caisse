/**
 * Migration ponctuelle : rend la colonne partenaire_id de trx_sous_bon nullable.
 * Le partenaire devient facultatif sur les sous-bons (cas des opérations internes).
 *
 * Usage : npx ts-node -r tsconfig-paths/register src/scripts/make-sous-bon-partenaire-nullable.ts
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { DataSource } from 'typeorm';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const ds = app.get(DataSource);

  try {
    // Vérifie l'état actuel de la colonne (idempotent)
    const rows: Array<{ is_nullable: number }> = await ds.query(`
      SELECT CASE WHEN is_nullable = 1 THEN 1 ELSE 0 END AS is_nullable
      FROM sys.columns
      WHERE Name = N'partenaire_id' AND Object_ID = OBJECT_ID(N'dbo.trx_sous_bon')
    `);
    if (rows.length === 0) {
      console.log("Colonne partenaire_id introuvable sur dbo.trx_sous_bon.");
      return;
    }
    if (rows[0].is_nullable === 1) {
      console.log('OK : partenaire_id est déjà nullable.');
      return;
    }

    // Drop la contrainte de clé étrangère pour la recréer ensuite (sinon ALTER échoue)
    const fkRows: Array<{ name: string }> = await ds.query(`
      SELECT fk.name
      FROM sys.foreign_keys fk
      INNER JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
      INNER JOIN sys.columns c ON c.object_id = fkc.parent_object_id AND c.column_id = fkc.parent_column_id
      WHERE fkc.parent_object_id = OBJECT_ID(N'dbo.trx_sous_bon') AND c.name = N'partenaire_id'
    `);

    for (const fk of fkRows) {
      await ds.query(`ALTER TABLE dbo.trx_sous_bon DROP CONSTRAINT [${fk.name}]`);
      console.log(`FK ${fk.name} supprimée temporairement.`);
    }

    await ds.query(`
      ALTER TABLE dbo.trx_sous_bon ALTER COLUMN partenaire_id BIGINT NULL
    `);
    console.log('Colonne partenaire_id passée en NULL.');

    // Recréer la FK
    await ds.query(`
      ALTER TABLE dbo.trx_sous_bon
      ADD CONSTRAINT FK_trx_sous_bon_partenaire
      FOREIGN KEY (partenaire_id) REFERENCES dbo.ref_partenaire(id)
    `);
    console.log('FK_trx_sous_bon_partenaire recréée.');

    console.log('OK : migration partenaire_id nullable terminée.');
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
