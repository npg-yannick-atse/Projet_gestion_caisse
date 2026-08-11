import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateBonDto } from './create-bon.dto';

/**
 * Validation du corps de `POST /bons`.
 *
 * Avant le 05/08/2026, ce endpoint recevait une simple `interface` TypeScript.
 * Une interface disparaît à la compilation : le ValidationPipe n'avait donc RIEN
 * à valider et tout le corps de la requête passait sans contrôle. Seul le numéro
 * client était protégé, par un garde-fou écrit à la main dans le service.
 *
 * Ces tests exercent le VRAI DTO, avec les mêmes options que le pipe global
 * (`whitelist` + `forbidNonWhitelisted`), pour deux raisons :
 *  1. vérifier que les règles mordent réellement (notamment dans le tableau
 *     `soubons`, où elles sont ignorées sans @ValidateNested) ;
 *  2. garantir que le formulaire web et l'application mobile passent toujours —
 *     `forbidNonWhitelisted` rejette tout champ non déclaré, une omission dans
 *     le DTO casserait la création de bon en production.
 */

/** Reproduit exactement la configuration du ValidationPipe de `main.ts`. */
function valider(payload: unknown): string[] {
  const dto = plainToInstance(CreateBonDto, payload, { enableImplicitConversion: true });
  const erreurs = validateSync(dto as object, {
    whitelist: true,
    forbidNonWhitelisted: true,
    // Sans ceci, les erreurs des sous-objets ne remontent pas et le test serait
    // vert alors que rien n'est vérifié dans `soubons`.
    validationError: { target: false },
  });
  const messages: string[] = [];
  const collecter = (liste: typeof erreurs) => {
    for (const e of liste) {
      if (e.constraints) messages.push(...Object.values(e.constraints));
      if (e.children?.length) collecter(e.children);
    }
  };
  collecter(erreurs);
  return messages;
}

/** Sous-bon minimal valide, tel que l'écran de création l'envoie. */
const sousBon = {
  libelle: 'Frais de manutention',
  montant: '50000',
  numeroBl: 'BL-2026-001',
  codeManutention: 'MAN-01',
  costCenterId: '3',
  natureOperationId: '7',
  caisseId: '1',
  portefeuilleId: '2',
  deviseId: '1',
};

const bon = { typeBonId: '4', soubons: [sousBon] };

describe('CreateBonDto — numéro client (identifiant SAP KUNNR)', () => {
  it('refuse un numéro contenant des lettres', () => {
    // Les valeurs « TEST », « DFF », « GF » ont réellement été trouvées en base.
    for (const v of ['TEST', 'DFF', 'GF', '4111A00535', '12 345', '4111-0005']) {
      const messages = valider({ ...bon, soubons: [{ ...sousBon, numeroClient: v }] });
      expect(messages).toContain('Le numéro client ne doit contenir que des chiffres.');
    }
  });

  it('accepte un identifiant SAP, zéros de tête compris', () => {
    for (const v of ['4111000535', '0000012345', '']) {
      expect(valider({ ...bon, soubons: [{ ...sousBon, numeroClient: v }] })).toEqual([]);
    }
  });

  it('accepte l’absence de numéro — le champ est optionnel', () => {
    expect(valider(bon)).toEqual([]);
  });

  it('contrôle CHAQUE sous-bon, pas seulement le premier', () => {
    // Le piège classique : sans @ValidateNested({ each: true }), seul le premier
    // élément — voire aucun — serait examiné.
    const messages = valider({
      ...bon,
      soubons: [{ ...sousBon, numeroClient: '4111000535' }, { ...sousBon, numeroClient: 'ABC' }],
    });
    expect(messages).toContain('Le numéro client ne doit contenir que des chiffres.');
  });
});

describe('CreateBonDto — le formulaire web et le mobile doivent passer', () => {
  it('accepte la charge utile complète de l’écran de création', () => {
    expect(
      valider({
        typeBonId: '4',
        estRecurrent: false,
        porteur: 'KOUASSI Jean',
        demandeExtension: false,
        soubons: [
          {
            ...sousBon,
            partenaireId: '12',
            natureComptableId: '9',
            numeroClient: '4111000535',
            nomClient: 'SOCIETE X',
            paysId: '1',
            divisionId: '2',
            description: 'Note',
          },
        ],
      }),
    ).toEqual([]);
  });

  it('accepte la charge utile du mobile (champs optionnels absents)', () => {
    expect(
      valider({ typeBonId: '4', soubons: [sousBon], estRecurrent: false, porteur: 'Agent' }),
    ).toEqual([]);
  });

  it('accepte une récurrence déclarée', () => {
    expect(valider({ ...bon, estRecurrent: true, frequenceRecurrence: 'MENSUEL' })).toEqual([]);
  });

  it('refuse une fréquence de récurrence inconnue', () => {
    expect(valider({ ...bon, estRecurrent: true, frequenceRecurrence: 'HEBDO' }).length).toBeGreaterThan(0);
  });
});

describe('CreateBonDto — champs structurants', () => {
  it('refuse un bon sans aucun sous-bon', () => {
    expect(valider({ typeBonId: '4', soubons: [] })).toContain(
      'Un bon doit comporter au moins un sous-bon.',
    );
  });

  it('refuse un montant qui n’est pas un nombre', () => {
    expect(
      valider({ ...bon, soubons: [{ ...sousBon, montant: 'beaucoup' }] }),
    ).toContain('Montant invalide : chiffres uniquement, avec un point comme séparateur décimal.');
  });

  it('refuse un montant dépassant la capacité de la colonne', () => {
    // DECIMAL(19,4) s'arrête à 15 chiffres entiers. Au-delà, le pilote SQL
    // échouait avec un message technique affiché tel quel à l'utilisateur.
    expect(
      valider({ ...bon, soubons: [{ ...sousBon, montant: '1'.repeat(20) }] }),
    ).toContain('Montant trop grand (maximum 999 999 999 999 999,9999).');
  });

  it('accepte le montant maximal exact', () => {
    expect(
      valider({ ...bon, soubons: [{ ...sousBon, montant: '999999999999999.9999' }] }),
    ).toHaveLength(0);
  });

  it('refuse un identifiant de rattachement non numérique', () => {
    // costCenterId, caisseId, portefeuilleId… sont des clés étrangères BIGINT :
    // y laisser passer du texte provoquerait une erreur SQL plus loin.
    expect(valider({ ...bon, soubons: [{ ...sousBon, costCenterId: 'RH' }] }).length).toBeGreaterThan(0);
    expect(valider({ ...bon, soubons: [{ ...sousBon, caisseId: 'CI01' }] }).length).toBeGreaterThan(0);
  });

  it('refuse un champ inconnu — protège contre une injection de propriété', () => {
    expect(valider({ ...bon, demandeurId: '99' }).length).toBeGreaterThan(0);
    expect(valider({ ...bon, soubons: [{ ...sousBon, statut: 'DECAISSE' }] }).length).toBeGreaterThan(0);
  });

  it('refuse un libellé au-delà de la longueur stockable', () => {
    expect(
      valider({ ...bon, soubons: [{ ...sousBon, libelle: 'x'.repeat(256) }] }).length,
    ).toBeGreaterThan(0);
  });
});
