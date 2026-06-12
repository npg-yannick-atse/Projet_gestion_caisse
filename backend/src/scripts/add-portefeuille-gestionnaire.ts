/**
 * Migration ponctuelle : ajoute la colonne gestionnaire_id sur fin_portefeuille.
 * Permet d'identifier l'utilisateur en charge du pilotage d'un portefeuille.
 * Usage : npx ts-node -r tsconfig-paths/register src/scripts/add-portefeuille-gestionnaire.ts
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
        WHERE Name = N'gestionnaire_id' AND Object_ID = OBJECT_ID(N'dbo.fin_portefeuille')
      )
      BEGIN
        ALTER TABLE dbo.fin_portefeuille ADD gestionnaire_id BIGINT NULL;
        PRINT 'Colonne gestionnaire_id ajoutee.';
      END
      ELSE
      BEGIN
        PRINT 'Colonne gestionnaire_id deja presente.';
      END
    `);

    // Index pour les requêtes "mes portefeuilles" du gestionnaire
    await ds.query(`
      IF NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'IX_fin_portefeuille_gestionnaire' AND object_id = OBJECT_ID(N'dbo.fin_portefeuille')
      )
      BEGIN
        CREATE INDEX IX_fin_portefeuille_gestionnaire ON dbo.fin_portefeuille(gestionnaire_id) WHERE gestionnaire_id IS NOT NULL;
        PRINT 'Index IX_fin_portefeuille_gestionnaire cree.';
      END
      ELSE
      BEGIN
        PRINT 'Index IX_fin_portefeuille_gestionnaire deja present.';
      END
    `);

    // Contrainte FK vers sec_user (best-effort, ignorée si elle existe déjà)
    await ds.query(`
      IF NOT EXISTS (
        SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_fin_portefeuille_gestionnaire'
      )
      BEGIN
        ALTER TABLE dbo.fin_portefeuille ADD CONSTRAINT FK_fin_portefeuille_gestionnaire
          FOREIGN KEY (gestionnaire_id) REFERENCES dbo.sec_user(id);
        PRINT 'Contrainte FK_fin_portefeuille_gestionnaire creee.';
      END
      ELSE
      BEGIN
        PRINT 'Contrainte FK_fin_portefeuille_gestionnaire deja presente.';
      END
    `);

    console.log('OK : migration gestionnaire portefeuille terminee.');
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
