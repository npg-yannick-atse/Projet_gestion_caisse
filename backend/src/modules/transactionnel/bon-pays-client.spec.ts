import { BadRequestException } from '@nestjs/common';
import { BonsService } from './bons.service';

/**
 * Cohérence entre le CLIENT choisi et le PAYS déclaré sur un sous-bon.
 *
 * L'habilitation porte sur la division que l'utilisateur déclare, jamais sur le
 * client réel. Un agent habilité sur une division ivoirienne pouvait donc créer
 * un bon pour un client angolais en déclarant la Côte d'Ivoire : le pays du
 * client n'était qu'une suggestion de l'écran, que rien n'empêchait de changer.
 */
function monter(opts: { clients?: any[]; pays?: any[] } = {}) {
  const clients = opts.clients ?? [
    { numero_client: '1000', raison_sociale: 'SOCIETE ANGOLAISE', pays: 'AO' },
    { numero_client: '2000', raison_sociale: 'SOCIETE IVOIRIENNE', pays: 'CI' },
    { numero_client: '3000', raison_sociale: 'CLIENT SANS PAYS', pays: null },
  ];
  const pays = opts.pays ?? [
    { id: '1', code: 'CI', libelle: "Côte d'Ivoire" },
    { id: '2', code: 'AO', libelle: 'Angola' },
  ];

  const dataSource = {
    query: async (sql: string) => {
      if (sql.includes('ref_partenaire')) return clients;
      if (sql.includes('ref_pays')) return pays;
      return [];
    },
  };

  // On vise la méthode privée directement, sans passer par le constructeur :
  // `createBon` exigerait la moitié du module transactionnel, dont rien ici
  // n'est utilisé.
  const service: any = Object.create(BonsService.prototype);
  service.dataSource = dataSource;
  return (soubons: any[]) => service.assertPaysCoherentAvecClient(soubons);
}

describe('Bon client — le pays déclaré doit être celui du client', () => {
  it('refuse un client angolais déclaré en Côte d’Ivoire', async () => {
    const verifier = monter();
    await expect(verifier([{ numeroClient: '1000', paysId: '1' }])).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('nomme le client, son pays réel ET le pays déclaré', async () => {
    // Un refus qui ne dit pas laquelle des deux valeurs corriger fait chercher
    // au hasard.
    const verifier = monter();
    await expect(verifier([{ numeroClient: '1000', paysId: '1' }])).rejects.toThrow(
      /SOCIETE ANGOLAISE.*AO.*CI/s,
    );
  });

  it('accepte quand le pays correspond', async () => {
    const verifier = monter();
    await expect(verifier([{ numeroClient: '2000', paysId: '1' }])).resolves.toBeUndefined();
  });

  it('n’accuse pas un client dont le pays est inconnu', async () => {
    // On ne refuse que sur une contradiction CONSTATÉE, jamais sur une absence
    // d'information : sinon un référentiel incomplet bloquerait la saisie.
    const verifier = monter();
    await expect(verifier([{ numeroClient: '3000', paysId: '1' }])).resolves.toBeUndefined();
  });

  it('ignore un sous-bon sans client', async () => {
    const verifier = monter();
    await expect(verifier([{ paysId: '1' }])).resolves.toBeUndefined();
  });

  it('ignore un sous-bon sans pays déclaré', async () => {
    const verifier = monter();
    await expect(verifier([{ numeroClient: '1000' }])).resolves.toBeUndefined();
  });

  it('contrôle CHAQUE sous-bon, pas seulement le premier', async () => {
    // Un bon porte plusieurs sous-bons : n'en vérifier qu'un laisserait passer
    // les autres.
    const verifier = monter();
    await expect(
      verifier([
        { numeroClient: '2000', paysId: '1' }, // correct
        { numeroClient: '1000', paysId: '1' }, // incohérent
      ]),
    ).rejects.toThrow(/SOCIETE ANGOLAISE/);
  });

  it('compare sans tenir compte de la casse', async () => {
    const verifier = monter({
      clients: [{ numero_client: '2000', raison_sociale: 'X', pays: 'ci' }],
      pays: [{ id: '1', code: 'CI', libelle: "Côte d'Ivoire" }],
    });
    await expect(verifier([{ numeroClient: '2000', paysId: '1' }])).resolves.toBeUndefined();
  });

  it('n’interroge pas la base quand aucun sous-bon n’est concerné', async () => {
    let appels = 0;
    const dataSource = {
      query: async () => {
        appels++;
        return [];
      },
    };
    const service: any = Object.create(BonsService.prototype);
    service.dataSource = dataSource;
    await service.assertPaysCoherentAvecClient([{ montant: '1000' }]);
    expect(appels).toBe(0);
  });
});
