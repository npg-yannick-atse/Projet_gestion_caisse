import { TauxApiService } from './taux-api.service';

/**
 * L'aperçu d'import ne doit RIEN écrire.
 *
 * Un taux de change gouverne la conversion de tous les montants qui s'y
 * appuient ensuite. L'import écrivait dès le clic : on découvrait la cotation
 * une fois enregistrée, et la seule façon de revenir en arrière était de
 * ressaisir l'ancien taux à la main.
 *
 * Le test surveille le seul geste qui compte — l'appel à `ecrirePeriode`.
 */
describe("aperçu d'import des taux", () => {
  /** Monte le service avec des doublures, et compte les écritures. */
  function monter(tauxApi: number, tauxCourant: string | null) {
    const ecritures: unknown[] = [];

    const service = new TauxApiService(
      // repo des périodes de taux : renvoie le taux en vigueur, s'il y en a un
      { findOne: async () => (tauxCourant ? { taux: tauxCourant, pariteFixe: false } : null) } as any,
      // repo des devises
      { findOne: async ({ where }: any) => ({ id: '2', code: where.code }) } as any,
      // paramètres : une seule devise à importer
      { get: async (cle: string) => (cle.includes('DEVISES') ? 'USD' : 'true') } as any,
      // service des taux : c'est LUI qui écrit
      {
        deviseReference: async () => ({ id: '1', code: 'XOF' }),
        ecrirePeriode: async (p: unknown) => {
          ecritures.push(p);
        },
      } as any,
      // autorisations : toujours accordées
      { assertPermission: async () => undefined } as any,
    ) as any;

    // L'API extérieure est remplacée : aucun appel réseau dans un test.
    service.lireApi = async () => ({ taux: tauxApi, miseAJour: '2026-08-17' });

    return { service, ecritures };
  }

  it("n'écrit rien et annonce une simulation", async () => {
    const { service, ecritures } = monter(601.5, '600.00000000');

    const rapport = await service.importerManuel('2', true);

    expect(ecritures).toHaveLength(0);
    expect(rapport.simulation).toBe(true);
    // Le rapport décrit tout de même ce qui arriverait.
    expect(rapport.lignes).toHaveLength(1);
    expect(rapport.lignes[0]).toMatchObject({ devise: 'USD', statut: 'IMPORTE', taux: '601.50000000' });
    expect(rapport.importes).toBe(1);
  });

  it('écrit bel et bien quand on confirme', async () => {
    const { service, ecritures } = monter(601.5, '600.00000000');

    const rapport = await service.importerManuel('2');

    expect(ecritures).toHaveLength(1);
    expect(ecritures[0]).toMatchObject({ taux: '601.50000000', source: 'API' });
    expect(rapport.simulation).toBe(false);
  });

  it("l'aperçu et l'import décrivent la même chose", async () => {
    const attendu = { devise: 'USD', statut: 'IMPORTE', taux: '601.50000000', ancienTaux: '600.00000000' };

    const apercu = await monter(601.5, '600.00000000').service.importerManuel('2', true);
    const reel = await monter(601.5, '600.00000000').service.importerManuel('2');

    // Sinon l'aperçu serait un mensonge : on confirmerait autre chose que ce
    // qu'on a lu à l'écran.
    expect(apercu.lignes[0]).toMatchObject(attendu);
    expect(reel.lignes[0]).toMatchObject(attendu);
  });
});
