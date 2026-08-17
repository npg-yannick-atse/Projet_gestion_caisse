import { SapService } from './sap.service';

/**
 * Un partenaire marqué supprimé dans SAP ne doit pas entrer en base.
 *
 * LFA1 comptait 1767 lignes dont 883 marquées supprimées — la moitié — et KNA1
 * 62 sur 1601. Sans le filtre `LOEVM`, ces partenaires morts arrivaient mêlés
 * aux vivants dans la liste de création d'un bon, sans rien pour les
 * distinguer. Les 62 clients concernés sont d'ailleurs entrés ainsi.
 *
 * Le test décrit ce qui est ÉCRIT, pas comment : on remplace SAP et la base par
 * des doublures, et on regarde les INSERT produits.
 */
describe('synchronisation des partenaires : les supprimés de SAP restent dehors', () => {
  /** Une ligne RFC_READ_TABLE : les champs collés par des barres verticales. */
  const ligne = (num: string, nom: string, pays: string, supprime: boolean) => ({
    WA: [num, nom, 'ABIDJAN', pays, supprime ? 'X' : ''].join('|'),
  });

  /** Monte un service dont SAP et la base sont des doublures. */
  function monter(donnees: Array<{ WA: string }>) {
    const inserts: string[] = [];
    const service = new SapService({} as any) as any;

    service.withClient = async (fn: (c: any) => Promise<unknown>) =>
      fn({ call: async () => ({ DATA: donnees }) });

    service.dataSource = {
      query: async (sql: string) => {
        if (sql.startsWith('INSERT')) {
          inserts.push(sql);
          return [];
        }
        // Base vide : ni partenaire existant, ni pays au référentiel sauf CI.
        if (sql.includes('ref_pays')) return [{ id: '1', code: 'CI' }];
        return [];
      },
    };

    return { service, inserts };
  }

  describe.each([
    ['fournisseurs', 'synchroniserFournisseurs'],
    ['clients', 'synchroniserClients'],
  ])('%s', (_nom, methode) => {
    it('écarte les lignes marquées supprimées et compte celles qu’il a écartées', async () => {
      const { service, inserts } = monter([
        ligne('4011100000', 'VIVANT UN', 'CI', false),
        ligne('4011100001', 'MORT UN', 'CI', true),
        ligne('4011100002', 'VIVANT DEUX', 'CI', false),
        ligne('4011100003', 'MORT DEUX', 'CI', true),
      ]);

      const r = await service[methode]();

      expect(r).toMatchObject({ ajoutes: 2, totalSap: 2, ignoresSupprimes: 2 });
      const sql = inserts.join(' ');
      expect(sql).toContain('VIVANT UN');
      expect(sql).toContain('VIVANT DEUX');
      expect(sql).not.toContain('MORT UN');
      expect(sql).not.toContain('MORT DEUX');
    });

    it('rattache le pays au référentiel, et laisse le lien vide sur un code inconnu', async () => {
      const { service, inserts } = monter([
        ligne('4011100000', 'IVOIRIEN', 'CI', false),
        // « ZZ » n'est dans aucun référentiel : le partenaire entre quand même.
        // Un partenaire sans pays se corrige ; un partenaire absent bloque un bon.
        ligne('4011100001', 'INCONNU', 'ZZ', false),
      ]);

      const r = await service[methode]();

      expect(r.ajoutes).toBe(2);
      const sql = inserts.join(' ');
      expect(sql).toContain('IVOIRIEN');
      expect(sql).toContain('INCONNU');
      // L'ivoirien porte l'identifiant du pays, l'autre un lien nul.
      expect(sql).toMatch(/IVOIRIEN[^)]*, 1, 1, SYSUTCDATETIME/);
      expect(sql).toMatch(/INCONNU[^)]*, NULL, 1, SYSUTCDATETIME/);
    });
  });
});
