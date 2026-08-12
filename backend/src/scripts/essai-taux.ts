/**
 * DIAGNOSTIC des taux de change, hors HTTP : contexte Nest réel (donc injection
 * de dépendances réelle), appel réseau réel vers l'API de cotation, écriture en
 * base réelle, puis conversions.
 *
 * À LANCER SUR LE SERVEUR avant d'activer `TAUX_API_ENABLED` : c'est ce script
 * qui répond à la question « l'hôte du backend joint-il l'API ? ». Un réseau
 * qui filtre les sorties se voit à l'étape 2, ligne `ECHEC`.
 *
 * Sans danger à rejouer : un taux inchangé n'est pas réécrit (statut INCHANGE).
 *
 * Lancer : npx ts-node -r tsconfig-paths/register src/scripts/essai-taux.ts
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { TauxApiService } from '@modules/financier/taux-api.service';
import { TauxChangeService } from '@modules/financier/taux-change.service';
import { DevisesService } from '@modules/financier/devises.service';
import { CaissesService } from '@modules/financier/caisses.service';

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const api = app.get(TauxApiService);
  const taux = app.get(TauxChangeService);
  const devises = await app.get(DevisesService).findAll();
  const id = (code: string) => devises.find((d) => d.code === code)!.id;

  console.log('\n=== 1. Devise de référence ===');
  const ref = await taux.deviseReference();
  console.log(`${ref.code} — ${ref.libelle}, ${ref.nbDecimales} décimale(s)`);

  console.log("\n=== 2. Import depuis l'API ===");
  const rapport = await api.executerImport(null);
  console.log(`fraîcheur annoncée par l'API : ${rapport.fraicheurApi}`);
  console.table(rapport.lignes);

  console.log('\n=== 3. Import rejoué aussitôt (doit être INCHANGE) ===');
  console.table((await api.executerImport(null)).lignes);

  console.log('\n=== 4. Taux en vigueur ===');
  console.table(
    (await taux.listeCourants()).map((t) => ({
      couple: `${t.deviseSource} → ${t.deviseCible}`,
      taux: t.taux,
      inverse: t.tauxInverse,
      source: t.source,
      pariteFixe: t.pariteFixe,
      ageJours: t.ageJours,
      perime: t.perime,
    })),
  );

  console.log('\n=== 5. Conversions ===');
  const essais: Array<[string, string, string]> = [
    ['100', 'EUR', 'XOF'],
    ['655957', 'XOF', 'EUR'],
    ['1000', 'USD', 'XOF'],
    ['100', 'EUR', 'USD'],
  ];
  for (const [m, de, vers] of essais) {
    const c = await taux.convertir(m, id(de), id(vers));
    console.log(
      `${m.padStart(7)} ${de} → ${c.montantConverti.padStart(12)} ${vers}` +
        `   [${c.voie}, taux ${c.taux}, ${c.ageJours} j, ${c.perime ? 'PÉRIMÉ' : 'frais'}]`,
    );
  }

  console.log("\n=== 6. Consolidation d'un panier multi-devises ===");
  console.log(
    await taux.consolider([
      { montant: '1000000', deviseId: id('XOF') },
      { montant: '500', deviseId: id('EUR') },
      { montant: '250', deviseId: id('USD') },
    ]),
  );

  console.log('\n=== 7. Soldes réels des caisses, consolidés ===');
  const caisses = await app.get(CaissesService).findAll();
  for (const c of caisses) {
    const soldes = await app.get(CaissesService).getSoldesParDevise(c.id);
    const cons = await taux.consolider(
      soldes.map((s) => ({ montant: s.solde, deviseId: s.deviseId })),
    );
    const detail = soldes.map((s) => `${s.solde} ${s.code ?? '?'}`).join(' + ');
    console.log(
      `${c.code.padEnd(8)} ${detail}\n` +
        `${''.padEnd(9)}→ ${cons.total} ${cons.devise}` +
        `  (${cons.converties} converties, ${cons.ignorees.length} ignorée(s)` +
        `${cons.perime ? ', TAUX ANCIEN' : ''})`,
    );
    for (const i of cons.ignorees) console.log(`${''.padEnd(9)}  ⚠ ${i.raison}`);
  }

  await app.close();
}

main().catch((e) => {
  console.error('ÉCHEC :', e?.message ?? e);
  process.exit(1);
});
