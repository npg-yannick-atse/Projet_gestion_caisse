/**
 * Migration ponctuelle : ajoute le rôle GESTIONNAIRE_PORTEFEUILLE.
 * - Remplace la contrainte CHECK sur sec_role.code pour inclure le nouveau code
 * - Insère le rôle s'il n'existe pas
 * Usage : npx ts-node -r tsconfig-paths/register src/scripts/add-gestionnaire-role.ts
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { DataSource } from 'typeorm';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const ds = app.get(DataSource);

  try {
    // 1) Remplacer la contrainte CHECK si elle bloque le nouveau code
    await ds.query(`
      IF EXISTS (
        SELECT 1 FROM sys.check_constraints
        WHERE name = N'CK_sec_role_code' AND parent_object_id = OBJECT_ID(N'dbo.sec_role')
      )
      BEGIN
        ALTER TABLE dbo.sec_role DROP CONSTRAINT CK_sec_role_code;
        PRINT 'Ancienne contrainte CK_sec_role_code supprimee.';
      END
    `);

    await ds.query(`
      ALTER TABLE dbo.sec_role ADD CONSTRAINT CK_sec_role_code
        CHECK (code IN (N'SUPER_ADMIN', N'ADMINISTRATEUR', N'VALIDATEUR', N'DEMANDEUR', N'CAISSIER', N'GESTIONNAIRE_PORTEFEUILLE'));
      PRINT 'Contrainte CK_sec_role_code recree avec GESTIONNAIRE_PORTEFEUILLE.';
    `);

    // 2) Insérer le rôle si absent
    await ds.query(`
      IF NOT EXISTS (SELECT 1 FROM dbo.sec_role WHERE code = N'GESTIONNAIRE_PORTEFEUILLE')
      BEGIN
        INSERT INTO dbo.sec_role(code, libelle, description, est_systeme)
        VALUES (N'GESTIONNAIRE_PORTEFEUILLE', N'Gestionnaire de portefeuille',
                N'Pilote un ou plusieurs portefeuilles et arbitre les demandes d''extension', 1);
        PRINT 'Role GESTIONNAIRE_PORTEFEUILLE insere.';
      END
      ELSE
      BEGIN
        PRINT 'Role GESTIONNAIRE_PORTEFEUILLE deja present.';
      END
    `);

    console.log('OK : migration role gestionnaire terminee.');
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
