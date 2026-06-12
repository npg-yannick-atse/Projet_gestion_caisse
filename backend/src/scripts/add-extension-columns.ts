/**
 * Migration ponctuelle : ajoute les colonnes demande_extension et description_extension
 * sur trx_bon pour porter la demande d'extension de budget.
 * Usage : npx ts-node -r tsconfig-paths/register src/scripts/add-extension-columns.ts
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { DataSource } from 'typeorm';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const ds = app.get(DataSource);

  try {
    await ds.query(`
      IF NOT EXISTS (
        SELECT 1 FROM sys.columns
        WHERE Name = N'demande_extension' AND Object_ID = OBJECT_ID(N'dbo.trx_bon')
      )
      BEGIN
        ALTER TABLE dbo.trx_bon ADD demande_extension BIT NOT NULL CONSTRAINT DF_trx_bon_demande_extension DEFAULT (0);
        PRINT 'Colonne demande_extension ajoutee.';
      END
      ELSE
      BEGIN
        PRINT 'Colonne demande_extension deja presente.';
      END
    `);

    await ds.query(`
      IF NOT EXISTS (
        SELECT 1 FROM sys.columns
        WHERE Name = N'description_extension' AND Object_ID = OBJECT_ID(N'dbo.trx_bon')
      )
      BEGIN
        ALTER TABLE dbo.trx_bon ADD description_extension NVARCHAR(500) NULL;
        PRINT 'Colonne description_extension ajoutee.';
      END
      ELSE
      BEGIN
        PRINT 'Colonne description_extension deja presente.';
      END
    `);

    console.log('OK : migration extension terminee.');
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
