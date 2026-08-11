import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PaiementSalaireService } from './paiement-salaire.service';

/**
 * Paiement des salaires : normalisation de la période et garde-fous du versement.
 *
 * La période a déjà causé un bug : le contrôleur transmettait une chaîne vide
 * quand le paramètre était absent, et `??` ne se déclenchant que sur null, la
 * validation échouait au lieu de retomber sur le mois courant. D'où les cas
 * « vide » ci-dessous.
 */
describe('PaiementSalaireService.normaliserPeriode', () => {
  const courante = PaiementSalaireService.periodeCourante();

  it('retombe sur le mois courant quand la période est absente', () => {
    expect(PaiementSalaireService.normaliserPeriode(undefined)).toBe(courante);
  });

  it('retombe sur le mois courant quand la période est VIDE ou blanche', () => {
    // Cas réel : une query string non renseignée arrive comme chaîne vide.
    expect(PaiementSalaireService.normaliserPeriode('')).toBe(courante);
    expect(PaiementSalaireService.normaliserPeriode('   ')).toBe(courante);
  });

  it('accepte une période valide et ignore les espaces', () => {
    expect(PaiementSalaireService.normaliserPeriode('2026-01')).toBe('2026-01');
    expect(PaiementSalaireService.normaliserPeriode(' 2026-01 ')).toBe('2026-01');
  });

  it('refuse un format invalide', () => {
    for (const p of ['2026', '2026-1', '26-01', '2026/01', 'janvier', '2026-13', '2026-00']) {
      expect(() => PaiementSalaireService.normaliserPeriode(p)).toThrow(BadRequestException);
    }
  });

  it('refuse un mois à venir (pas de paiement d’avance)', () => {
    const [a, m] = courante.split('-').map(Number);
    const futur = m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`;
    expect(() => PaiementSalaireService.normaliserPeriode(futur)).toThrow(/à venir/i);
  });

  it('accepte un mois passé (régularisation)', () => {
    expect(PaiementSalaireService.normaliserPeriode('2020-03')).toBe('2020-03');
  });
});

/** Fabrique commune aux deux séries : garde-fous du versement et retenue. */
function build(opts: {
  employe?: any;
  dejaPaye?: any;
  caisse?: any;
  /** Crédit EN_COURS de l'employé, s'il en a un (null = aucun). */
  credit?: any;
  /** Situation renvoyée par le service de remboursement. */
  situation?: any;
} = {}) {
  const {
    employe = { id: '1', matricule: 'E001', estActif: true, salaire: '500000' },
    dejaPaye = null,
    caisse = { id: '9', code: 'C1', statut: 'OUVERTE' },
    credit = null,
    // Situation par défaut : crédit 4 000 000 sur 16 mois, rien de versé.
    // `mensualite` est le montant ATTENDU MAINTENANT (replanifié), c'est lui
    // que le service prélève — pas la mensualité d'origine.
    situation = {
      prochaineEcheance: 1,
      rembourse: '0.0000',
      restant: '4000000.0000',
      mensualite: '250000.0000',
    },
  } = opts;

  const saved: any[] = [];
  const repo = {
    findOne: jest.fn(async () => dejaPaye),
    find: jest.fn(async () => []),
    create: jest.fn((x: any) => x),
    save: jest.fn(async (x: any) => {
      saved.push(x);
      return { id: '100', ...x };
    }),
  };
  // Dépôt du crédit, distinct de celui des paiements : le manager doit rendre
  // l'un ou l'autre selon l'entité demandée, sinon `retenirMensualite`
  // interrogerait le mauvais dépôt.
  //
  // Le `findOne` HONORE réellement la clause `where` au lieu de rendre le crédit
  // quoi qu'il arrive : c'est la seule façon de vérifier que le service filtre
  // bien sur `prelevementSalaire` et sur le statut EN_COURS. Un mock complaisant
  // laisserait passer la suppression de ces filtres sans qu'aucun test rougisse.
  const creditRepo = {
    findOne: jest.fn(async ({ where }: any = {}) => {
      if (!credit) return null;
      for (const [cle, attendu] of Object.entries(where ?? {})) {
        if (String((credit as any)[cle]) !== String(attendu)) return null;
      }
      return credit;
    }),
    save: jest.fn(async (x: any) => x),
  };
  const remboursements = {
    situation: jest.fn(async () => situation),
    enregistrerDepuisSalaire: jest.fn(async (_c: any, l: any) => ({ id: '900', ...l })),
  };
  const push = { notifyRetenueSalaire: jest.fn(async () => undefined) };
  const ledger = {
    createOperation: jest.fn(async () => ({ transactionUuid: 'uuid-1' })),
    createPairedEcritures: jest.fn(async () => [{}, {}]),
  };
  const authz = {
    assertCaisseInPerimeter: jest.fn(async () => undefined),
    assertPortefeuilleInPerimeter: jest.fn(async () => undefined),
  };
  const dataSource = {
    getRepository: jest.fn(() => ({ findOne: jest.fn(async () => caisse) })),
    transaction: jest.fn(async (cb: any) =>
      cb({ getRepository: jest.fn((e: any) => (e?.name === 'Credit' ? creditRepo : repo)) }),
    ),
  };
  const service = new PaiementSalaireService(
    repo as any,
    { findOne: jest.fn(async () => employe) } as any,
    dataSource as any,
    ledger as any,
    authz as any,
    remboursements as any,
    push as any,
    // Historique des salaires : sans période enregistrée, le service se replie
    // sur la fiche de l'employé — c'est ce que ces tests exercent.
    { salaireDuMois: async () => null, salairesDuMois: async () => new Map() } as any,
  );
  return { service, ledger, saved, repo, remboursements, push, creditRepo };
}

describe('PaiementSalaireService.payer — garde-fous', () => {

  const input = {
    employeId: '1',
    sourceType: 'CAISSE' as const,
    sourceId: '9',
    deviseId: '1',
  };

  it('verse le salaire de la fiche quand aucun montant n’est fourni', async () => {
    const { service, saved } = build();
    await service.payer(input, '77');
    expect(saved[0].montant).toBe('500000');
  });

  it('privilégie le montant explicitement saisi', async () => {
    const { service, saved } = build();
    await service.payer({ ...input, montant: '250000' }, '77');
    expect(saved[0].montant).toBe('250000');
  });

  it('génère DÉBIT source / CRÉDIT salaire (l’argent sort)', async () => {
    const { service, ledger } = build();
    await service.payer(input, '77');
    const [debit, credit] = (ledger.createPairedEcritures as jest.Mock).mock.calls[0];
    expect(debit.typeCompte).toBe('CAISSE');
    expect(credit.typeCompte).toBe('SALAIRE');
  });

  it('refuse un employé sans salaire renseigné', async () => {
    const { service } = build({ employe: { id: '1', matricule: 'E001', estActif: true, salaire: null } });
    await expect(service.payer(input, '77')).rejects.toThrow(/Aucun montant/i);
  });

  it('refuse un salaire nul ou négatif', async () => {
    for (const s of ['0', '-100']) {
      const { service } = build({ employe: { id: '1', matricule: 'E001', estActif: true, salaire: s } });
      await expect(service.payer(input, '77')).rejects.toThrow(/Aucun montant/i);
    }
  });

  it('refuse un employé inactif', async () => {
    const { service } = build({ employe: { id: '1', matricule: 'E001', estActif: false, salaire: '1' } });
    await expect(service.payer(input, '77')).rejects.toThrow(/inactif/i);
  });

  it('refuse un employé introuvable', async () => {
    const { service } = build({ employe: null });
    await expect(service.payer(input, '77')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuse un second paiement pour le même mois', async () => {
    const { service, ledger } = build({
      dejaPaye: { id: '5', datePaiement: new Date('2026-07-31'), montant: '500000' },
    });
    await expect(service.payer(input, '77')).rejects.toBeInstanceOf(ConflictException);
    // Surtout : aucune écriture ne doit avoir été générée.
    expect(ledger.createPairedEcritures).not.toHaveBeenCalled();
  });

  it('refuse de payer depuis une caisse fermée', async () => {
    const { service, ledger } = build({ caisse: { id: '9', code: 'C1', statut: 'FERMEE' } });
    await expect(service.payer(input, '77')).rejects.toThrow(/fermée/i);
    expect(ledger.createPairedEcritures).not.toHaveBeenCalled();
  });

  it('n’exige pas de caisse ouverte pour un portefeuille', async () => {
    const { service, saved } = build({ caisse: { id: '9', code: 'C1', statut: 'FERMEE' } });
    await service.payer({ ...input, sourceType: 'PORTEFEUILLE' }, '77');
    expect(saved[0].sourceType).toBe('PORTEFEUILLE');
  });

  it('rattache le paiement à la transaction du grand livre', async () => {
    const { service, saved } = build();
    await service.payer(input, '77');
    expect(saved[0].transactionUuid).toBe('uuid-1');
    expect(saved[0].statut).toBe('PAYE');
  });
});

/**
 * Retenue de la mensualité de crédit sur le salaire.
 *
 * Décision métier du 05/08/2026 : l'autorisation est donnée UNE FOIS, à
 * l'approbation du crédit. Chaque paie retient ensuite automatiquement, et
 * l'approbateur est informé. Sans autorisation, la paie ne touche à rien.
 */
describe('PaiementSalaireService.payer — retenue de la mensualité', () => {
  /** Crédit de 4 000 000 sur 16 mois → mensualité 250 000. */
  const CREDIT = {
    id: '5',
    employeId: '1',
    montant: '4000000.0000',
    nbMois: 16,
    sourceType: 'CAISSE',
    sourceId: '9',
    deviseId: '1',
    statut: 'EN_COURS',
    dateDebut: '2026-01-05',
    prelevementSalaire: true,
  };
  const payer = (s: any) =>
    s.payer({ employeId: '1', periode: '2026-08', sourceType: 'CAISSE', sourceId: '9', deviseId: '1' }, '10');

  it('ne retient rien quand l’employé n’a aucun crédit en cours', async () => {
    const { service, remboursements } = build();
    await payer(service);
    expect(remboursements.enregistrerDepuisSalaire).not.toHaveBeenCalled();
  });

  it('ne retient rien si le prélèvement n’a pas été autorisé', async () => {
    // Le DAF n'a pas coché l'autorisation à l'approbation : la paie ne doit
    // toucher à rien. Le crédit EXISTE bien ici — c'est le filtre du service
    // qui doit l'écarter, pas l'absence de données.
    const { service, remboursements } = build({
      credit: { ...CREDIT, prelevementSalaire: false },
    });
    await payer(service);
    expect(remboursements.enregistrerDepuisSalaire).not.toHaveBeenCalled();
  });

  it('ne retient rien sur un crédit qui n’est pas en cours', async () => {
    // Un crédit approuvé mais pas encore décaissé ne doit rien : retenir
    // dessus créerait une créance négative.
    for (const statut of ['APPROUVEE', 'SOLDE', 'ANNULEE']) {
      const { service, remboursements } = build({ credit: { ...CREDIT, statut } });
      await payer(service);
      expect(remboursements.enregistrerDepuisSalaire).not.toHaveBeenCalled();
    }
  });

  it('retient la mensualité due lorsque le prélèvement est autorisé', async () => {
    const { service, remboursements } = build({ credit: { ...CREDIT } });
    await payer(service);
    expect(remboursements.enregistrerDepuisSalaire).toHaveBeenCalledTimes(1);
    const [, ligne] = remboursements.enregistrerDepuisSalaire.mock.calls[0];
    expect(ligne).toMatchObject({ echeance: 1, montant: '250000.0000' });
  });

  it('impute l’échéance que la situation désigne, pas systématiquement la première', async () => {
    const { service, remboursements } = build({
      credit: { ...CREDIT },
      situation: { prochaineEcheance: 4, rembourse: '750000.0000', restant: '3250000.0000', mensualite: '250000.0000' },
    });
    await payer(service);
    expect(remboursements.enregistrerDepuisSalaire.mock.calls[0][1].echeance).toBe(4);
  });

  it('rattache la retenue au paiement de salaire qui l’a produite', async () => {
    // Sans ce lien, l'annulation d'une paie ne saurait pas quelle retenue
    // contre-passer.
    const { service, remboursements } = build({ credit: { ...CREDIT } });
    await payer(service);
    expect(remboursements.enregistrerDepuisSalaire.mock.calls[0][1].paiementSalaireId).toBe('100');
  });

  it('informe l’approbateur de la retenue', async () => {
    const { service, push } = build({ credit: { ...CREDIT } });
    await payer(service);
    expect(push.notifyRetenueSalaire).toHaveBeenCalledTimes(1);
  });

  it('ne retient rien quand toutes les échéances sont déjà réglées', async () => {
    const { service, remboursements } = build({
      credit: { ...CREDIT },
      situation: { prochaineEcheance: null, rembourse: '4000000.0000', restant: '0.0000', mensualite: '0.0000' },
    });
    await payer(service);
    expect(remboursements.enregistrerDepuisSalaire).not.toHaveBeenCalled();
  });

  it('ne retient rien si le salaire est inférieur à la mensualité', async () => {
    // Règle provisoire : le salaire part en entier et l'échéance bascule « en
    // retard », plutôt que d'amputer une paie ou de bloquer le versement.
    const { service, remboursements, saved } = build({
      employe: { id: '1', matricule: 'E001', estActif: true, salaire: '180000' },
      credit: { ...CREDIT },
    });
    await payer(service);
    expect(remboursements.enregistrerDepuisSalaire).not.toHaveBeenCalled();
    expect(saved[0].montant).toBe('180000');
  });

  it('ne retient rien si le salaire et le crédit ne sont pas dans la même devise', async () => {
    // Prélever des XOF sur une créance libellée en USD reviendrait à
    // additionner deux monnaies — le bug corrigé sur les soldes de caisse.
    const { service, remboursements } = build({ credit: { ...CREDIT, deviseId: '3' } });
    await payer(service);
    expect(remboursements.enregistrerDepuisSalaire).not.toHaveBeenCalled();
  });

  it('verse le salaire en entier : c’est la retenue qui ramène l’argent, pas un montant net', async () => {
    // Les deux écritures se compensent sur la caisse ; inventer un « montant
    // net » fausserait le compte de salaire.
    const { service, saved } = build({ credit: { ...CREDIT } });
    await payer(service);
    expect(saved[0].montant).toBe('500000');
  });
});

/**
 * Précisions métier du 06/08/2026 :
 *  - le prélèvement ne commence qu'au DÉCAISSEMENT du crédit ;
 *  - si le salaire ne couvre pas l'échéance, le caissier indique ce qui peut
 *    être prélevé, on prélève ce montant, et le reliquat est reporté sur les
 *    mois suivants (la durée du crédit ne bouge pas).
 */
describe('PaiementSalaireService.payer — début du prélèvement et retenue partielle', () => {
  /** Crédit décaissé le 27/07/2026, échéance courante attendue : 250 000. */
  const CREDIT = {
    id: '5',
    employeId: '1',
    montant: '4000000.0000',
    nbMois: 16,
    sourceType: 'CAISSE',
    sourceId: '9',
    deviseId: '1',
    statut: 'EN_COURS',
    dateDebut: '2026-07-27',
    prelevementSalaire: true,
  };
  const SITUATION = { prochaineEcheance: 1, rembourse: '0.0000', restant: '4000000.0000', mensualite: '250000.0000' };
  const payer = (s: any, periode: string, extra: any = {}) =>
    s.payer(
      { employeId: '1', periode, sourceType: 'CAISSE', sourceId: '9', deviseId: '1', ...extra },
      '10',
    );

  it('ne prélève PAS sur un mois antérieur au décaissement', async () => {
    // Régularisation du salaire de juin alors que le crédit a été décaissé en
    // juillet : l'employé n'avait pas encore reçu l'argent.
    const { service, remboursements } = build({ credit: { ...CREDIT }, situation: SITUATION });
    await payer(service, '2026-06');
    expect(remboursements.enregistrerDepuisSalaire).not.toHaveBeenCalled();
  });

  it('prélève dès le mois du décaissement', async () => {
    const { service, remboursements } = build({ credit: { ...CREDIT }, situation: SITUATION });
    await payer(service, '2026-07');
    expect(remboursements.enregistrerDepuisSalaire).toHaveBeenCalledTimes(1);
  });

  it('prélève sur les mois suivants', async () => {
    const { service, remboursements } = build({ credit: { ...CREDIT }, situation: SITUATION });
    await payer(service, '2026-08');
    expect(remboursements.enregistrerDepuisSalaire).toHaveBeenCalledTimes(1);
  });

  it('prélève le montant indiqué par le caissier quand le salaire est insuffisant', async () => {
    const { service, remboursements } = build({
      employe: { id: '1', matricule: 'E001', estActif: true, salaire: '180000' },
      credit: { ...CREDIT },
      situation: SITUATION,
    });
    await payer(service, '2026-08', { montantRetenue: '100000' });
    const [, ligne] = remboursements.enregistrerDepuisSalaire.mock.calls[0];
    expect(ligne.montant).toBe('100000');
  });

  it('ne prélève rien si le caissier n’indique aucun montant', async () => {
    // On ne décide pas à sa place : sans saisie, le salaire part en entier.
    const { service, remboursements } = build({
      employe: { id: '1', matricule: 'E001', estActif: true, salaire: '180000' },
      credit: { ...CREDIT },
      situation: SITUATION,
    });
    await payer(service, '2026-08');
    expect(remboursements.enregistrerDepuisSalaire).not.toHaveBeenCalled();
  });

  it('refuse une retenue supérieure au salaire versé', async () => {
    // Sinon le caissier remettrait un montant négatif à l'employé.
    const { service } = build({
      employe: { id: '1', matricule: 'E001', estActif: true, salaire: '180000' },
      credit: { ...CREDIT },
      situation: SITUATION,
    });
    await expect(payer(service, '2026-08', { montantRetenue: '200000' })).rejects.toThrow(
      /ne peut pas dépasser le salaire/i,
    );
  });

  it('refuse une retenue supérieure au reste dû', async () => {
    const { service } = build({
      employe: { id: '1', matricule: 'E001', estActif: true, salaire: '900000' },
      credit: { ...CREDIT },
      situation: { ...SITUATION, restant: '120000.0000', mensualite: '950000.0000' },
    });
    await expect(payer(service, '2026-08', { montantRetenue: '500000' })).rejects.toThrow(
      /dépasse le reste dû/i,
    );
  });

  it('ignore le montant saisi quand le salaire couvre l’échéance', async () => {
    // Le caissier ne doit pas pouvoir minorer une retenue qui passe normalement.
    const { service, remboursements } = build({ credit: { ...CREDIT }, situation: SITUATION });
    await payer(service, '2026-08', { montantRetenue: '1000' });
    expect(remboursements.enregistrerDepuisSalaire.mock.calls[0][1].montant).toBe('250000.0000');
  });

  it('prélève l’échéance REPLANIFIÉE, pas la mensualité d’origine', async () => {
    // Après un mois court, la situation annonce 261 538,46 : c'est ce montant
    // qui doit être prélevé.
    const { service, remboursements } = build({
      credit: { ...CREDIT },
      situation: { prochaineEcheance: 4, rembourse: '600000.0000', restant: '3400000.0000', mensualite: '261538.4600' },
    });
    await payer(service, '2026-08');
    expect(remboursements.enregistrerDepuisSalaire.mock.calls[0][1].montant).toBe('261538.4600');
  });
});
