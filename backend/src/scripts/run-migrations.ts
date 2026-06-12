/**
 * Applique les migrations SQL idempotentes de backend/migrations/ dans l'ordre,
 * en gardant la trace de celles déjà exécutées (table dbo._migrations).
 *
 * Usage : npm run migrate
 *   (ou : npx ts-node -r tsconfig-paths/register src/scripts/run-migrations.ts)
 */
import 'reflect-metadata';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { DataSource } from 'typeorm';

const MIGRATIONS_DIR = join(__dirname, '..', '..', 'migrations');

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const ds = app.get(DataSource);

  try {
    // Table de suivi des migrations appliquées.
    await ds.query(`
      IF OBJECT_ID(N'dbo._migrations', N'U') IS NULL
      CREATE TABLE dbo._migrations (
        name        NVARCHAR(255) NOT NULL CONSTRAINT PK__migrations PRIMARY KEY,
        applied_at  DATETIME2(3)  NOT NULL CONSTRAINT DF__migrations_at DEFAULT SYSUTCDATETIME()
      );
    `);

    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.toLowerCase().endsWith('.sql'))
      .sort();

    const appliedRows: Array<{ name: string }> = await ds.query('SELECT name FROM dbo._migrations');
    const applied = new Set(appliedRows.map((r) => r.name));

    let count = 0;
    for (const file of files) {
      if (applied.has(file)) {
        console.log(`=  déjà appliqué : ${file}`);
        continue;
      }

      const raw = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
      // Découpe sur les séparateurs de batch « GO » (s'il y en a), sinon un seul batch.
      const batches = raw
        .split(/^\s*GO\s*$/gim)
        .map((b) => b.trim())
        .filter(Boolean);
      const safeName = file.replace(/'/g, "''");

      const qr = ds.createQueryRunner();
      await qr.connect();
      await qr.startTransaction();
      try {
        for (const batch of batches) await qr.query(batch);
        await qr.query(`INSERT INTO dbo._migrations(name) VALUES (N'${safeName}')`);
        await qr.commitTransaction();
        console.log(`✓  appliqué : ${file}`);
        count++;
      } catch (e) {
        await qr.rollbackTransaction();
        throw new Error(`Échec de la migration ${file} : ${(e as Error).message}`);
      } finally {
        await qr.release();
      }
    }

    console.log(`\nTerminé. ${count} migration(s) appliquée(s) sur ${files.length} fichier(s).`);
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
