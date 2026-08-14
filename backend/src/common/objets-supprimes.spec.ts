import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Aucun code ne doit nommer un objet SQL supprimé par une migration.
 *
 * Ce test existe parce que la fusion des natures (migration 0070) a laissé
 * derrière elle une requête vers `sec_profil_nature_operation` et une colonne
 * d'entité `nature_operation_id`. Ni `tsc` ni les 520 tests ne les ont vues :
 * une table s'écrit dans une chaîne de caractères, et les tests moquent la base.
 * L'erreur n'est apparue qu'à l'exécution, en production, sur un écran ouvert
 * par un utilisateur.
 *
 * Le contrôle porte sur le NOM SQL (`sec_profil_nature_operation`), jamais sur
 * le nom métier (`natureOperationId`) : les routes et les clés d'API gardent
 * volontairement l'ancien vocabulaire, que l'APK déjà installé utilise encore.
 */

/** Objets supprimés, et la migration qui les a fait disparaître. */
const SUPPRIMES: Array<{ nom: string; migration: string }> = [
  { nom: 'ref_nature_operation', migration: '0070' },
  { nom: 'ref_nature_operation_cost_center', migration: '0070' },
  { nom: 'sec_user_nature_operation', migration: '0070' },
  { nom: 'sec_profil_nature_operation', migration: '0070' },
  { nom: 'nature_operation_id', migration: '0070' },
];

function fichiersSource(dossier: string): string[] {
  const trouves: string[] = [];
  for (const entree of readdirSync(dossier)) {
    const chemin = join(dossier, entree);
    if (statSync(chemin).isDirectory()) {
      trouves.push(...fichiersSource(chemin));
    } else if (entree.endsWith('.ts') && !entree.endsWith('.spec.ts')) {
      trouves.push(chemin);
    }
  }
  return trouves;
}

describe('objets SQL supprimés', () => {
  const racine = join(__dirname, '..');
  const fichiers = fichiersSource(racine);

  it('trouve bien les sources à inspecter', () => {
    expect(fichiers.length).toBeGreaterThan(50);
  });

  for (const { nom, migration } of SUPPRIMES) {
    it(`aucun code ne nomme « ${nom} » (supprimé en ${migration})`, () => {
      // Un commentaire a le droit d'expliquer la disparition ; seul le code
      // exécuté doit se taire. On retire donc les commentaires avant de chercher.
      const coupables = fichiers.filter((f) => {
        const sansCommentaires = readFileSync(f, 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/(^|[^:])\/\/.*$/gm, '$1');
        return sansCommentaires.includes(nom);
      });

      expect(coupables.map((f) => f.slice(racine.length + 1).replace(/\\/g, '/'))).toEqual([]);
    });
  }
});
