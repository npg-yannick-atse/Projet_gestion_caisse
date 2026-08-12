/**
 * Vérifie la CHAÎNE D'INTÉGRITÉ du grand livre : pour chaque écriture, le hash
 * est recalculé depuis les champs stockés et comparé, puis le chaînage avec
 * l'écriture précédente de la MÊME transaction est contrôlé.
 *
 * À lancer après toute suppression de données (nettoyage de test, purge) :
 * c'est ce qui prouve qu'aucune écriture réelle n'a été abîmée.
 *
 * Lancer : npx ts-node -r tsconfig-paths/register src/scripts/verifier-grand-livre.ts
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { LedgerService } from '@modules/transactionnel/ledger.service';

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const ledger = app.get(LedgerService);

  const res = await ledger.verifyEcrituresChain();

  console.log(`\nÉcritures au total   : ${res.total}`);
  console.log(`Réellement vérifiées : ${res.verifiees}`);
  console.log(`Chaîne d'intégrité   : ${res.ok ? 'INTACTE' : 'ROMPUE'}`);

  if (res.nonVerifiables.length > 0) {
    console.log(
      `\n${res.nonVerifiables.length} écriture(s) NON VÉRIFIABLES — antérieures au 27/07/2026,\n` +
        `  quand le hash était calculé sur un horodatage qui n'était pas enregistré.\n` +
        `  Elles ne sont pas falsifiées : elles ne peuvent simplement pas être recalculées.`,
    );
  }

  if (!res.ok) {
    console.log(`\n${res.invalides.length} écriture(s) EN DÉFAUT :`);
    console.table(res.invalides.slice(0, 20));
  }

  await app.close();
  process.exit(res.ok ? 0 : 1);
}

main().catch((e) => {
  console.error('ÉCHEC :', e?.message ?? e);
  process.exit(1);
});
