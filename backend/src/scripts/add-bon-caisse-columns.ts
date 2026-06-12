/**
 * Migration ponctuelle : aligne dbo.trx_bon_caisse sur le workflow caissier
 * prepare -> update -> finalize.
 *
 * Idempotente : peut etre rejouee sans risque.
 * Usage : npx ts-node -r tsconfig-paths/register src/scripts/add-bon-caisse-columns.ts
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { DataSource } from 'typeorm';

const COLUMN_STATEMENTS: Array<{ name: string; ddl: string }> = [
  {
    name: 'beneficiaire_piece',
    ddl: `ALTER TABLE dbo.trx_bon_caisse ADD beneficiaire_piece NVARCHAR(100) NULL;`,
  },
  {
    name: 'libelle_ajuste',
    ddl: `ALTER TABLE dbo.trx_bon_caisse ADD libelle_ajuste NVARCHAR(255) NULL;`,
  },
  {
    name: 'montant_ajuste',
    ddl: `ALTER TABLE dbo.trx_bon_caisse ADD montant_ajuste DECIMAL(19,4) NULL;`,
  },
  {
    name: 'commentaire',
    ddl: `ALTER TABLE dbo.trx_bon_caisse ADD commentaire NVARCHAR(500) NULL;`,
  },
  {
    name: 'date_decaissement',
    ddl: `ALTER TABLE dbo.trx_bon_caisse ADD date_decaissement DATETIME2(3) NULL;`,
  },
  // Colonnes d'audit (AuditableEntity)
  {
    name: 'created_by_id',
    ddl: `ALTER TABLE dbo.trx_bon_caisse ADD created_by_id BIGINT NULL;`,
  },
  {
    name: 'updated_at',
    ddl: `ALTER TABLE dbo.trx_bon_caisse ADD updated_at DATETIME2(3) NULL;`,
  },
  {
    name: 'updated_by_id',
    ddl: `ALTER TABLE dbo.trx_bon_caisse ADD updated_by_id BIGINT NULL;`,
  },
  {
    name: 'deleted_at',
    ddl: `ALTER TABLE dbo.trx_bon_caisse ADD deleted_at DATETIME2(3) NULL;`,
  },
  {
    name: 'deleted_by_id',
    ddl: `ALTER TABLE dbo.trx_bon_caisse ADD deleted_by_id BIGINT NULL;`,
  },
  {
    name: 'version',
    ddl:
      `ALTER TABLE dbo.trx_bon_caisse ADD version INT NOT NULL ` +
      `CONSTRAINT DF_trx_bon_caisse_version DEFAULT (1);`,
  },
];

async function ensureColumn(ds: DataSource, name: string, ddl: string) {
  await ds.query(`
    IF NOT EXISTS (
      SELECT 1 FROM sys.columns
      WHERE Name = N'${name}' AND Object_ID = OBJECT_ID(N'dbo.trx_bon_caisse')
    )
    BEGIN
      ${ddl}
      PRINT 'Colonne ${name} ajoutee.';
    END
    ELSE
    BEGIN
      PRINT 'Colonne ${name} deja presente.';
    END
  `);
}

async function realignStatutDefault(ds: DataSource) {
  // Remplace l'ancien default 'CREE' par 'PREPARE' si encore present
  await ds.query(`
    DECLARE @defaultName SYSNAME;
    SELECT @defaultName = dc.name
    FROM sys.default_constraints dc
    INNER JOIN sys.columns c ON c.default_object_id = dc.object_id
    WHERE dc.parent_object_id = OBJECT_ID(N'dbo.trx_bon_caisse')
      AND c.name = N'statut';

    IF @defaultName IS NOT NULL
    BEGIN
      EXEC ('ALTER TABLE dbo.trx_bon_caisse DROP CONSTRAINT ' + @defaultName);
      PRINT 'Default statut precedent supprime.';
    END

    ALTER TABLE dbo.trx_bon_caisse
      ADD CONSTRAINT DF_trx_bon_caisse_statut DEFAULT (N'PREPARE') FOR statut;
    PRINT 'Default statut=PREPARE applique.';
  `);
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const ds = app.get(DataSource);

  try {
    for (const col of COLUMN_STATEMENTS) {
      await ensureColumn(ds, col.name, col.ddl);
    }

    // Realigne le default du statut sur PREPARE (le code defaut etait CREE auparavant)
    try {
      await realignStatutDefault(ds);
    } catch (e) {
      console.warn('Re-alignement default statut ignore :', (e as Error).message);
    }

    console.log('OK : migration trx_bon_caisse terminee.');
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
