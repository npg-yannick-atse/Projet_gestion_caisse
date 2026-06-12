/**
 * Migration ponctuelle : ajoute la colonne est_actif sur fin_caisse.
 * Indépendant de statut (OUVERTE/FERMEE = session). estActif = caisse utilisable.
 * Usage : npx ts-node -r tsconfig-paths/register src/scripts/add-caisse-estactif.ts
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
        WHERE Name = N'est_actif' AND Object_ID = OBJECT_ID(N'dbo.fin_caisse')
      )
      BEGIN
        ALTER TABLE dbo.fin_caisse ADD est_actif BIT NOT NULL CONSTRAINT DF_fin_caisse_estactif DEFAULT (1);
        PRINT 'Colonne est_actif ajoutee sur fin_caisse.';
      END
      ELSE
      BEGIN
        PRINT 'Colonne est_actif deja presente.';
      END
    `);
    console.log('OK : migration est_actif sur caisse terminee.');
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
