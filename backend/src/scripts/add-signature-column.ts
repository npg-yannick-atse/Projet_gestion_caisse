/**
 * Migration ponctuelle : ajoute la colonne signature_image sur trx_impression_bon
 * pour stocker l'image PNG de la signature manuscrite.
 * Usage : npm run migrate:signature
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
        WHERE Name = N'signature_image' AND Object_ID = OBJECT_ID(N'dbo.trx_impression_bon')
      )
      BEGIN
        ALTER TABLE dbo.trx_impression_bon ADD signature_image NVARCHAR(MAX) NULL;
        PRINT 'Colonne signature_image ajoutée.';
      END
      ELSE
      BEGIN
        PRINT 'Colonne signature_image déjà présente.';
      END
    `);
    console.log('OK : migration terminée.');
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
