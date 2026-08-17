import { Injectable } from '@nestjs/common';
import type { RecuCaisse } from './entities/recu-caisse.entity';

/*
 * CÂBLAGE DE PDFMAKE 0.3 — trois pièges, tous rencontrés :
 *
 *  1. Le générateur SERVEUR vit dans `js/printer`, pas à la racine :
 *     `require('pdfmake')` rend l'objet destiné au NAVIGATEUR, sans constructeur.
 *  2. Chaque module expose sa classe sous `default` (compilation ESM → CJS).
 *  3. Le constructeur prend QUATRE arguments, et sans le système de fichiers
 *     virtuel ni le résolveur d'URL, la génération échoue sur
 *     « Cannot read properties of undefined (reading 'resolve') » — un message
 *     qui ne dit pas qu'il manque un argument.
 *
 * Et `createPdfKitDocument` rend une PROMESSE depuis cette version.
 */
/* eslint-disable @typescript-eslint/no-var-requires */
const printerModule = require('pdfmake/js/printer');
const PdfPrinter = printerModule.default ?? printerModule;
const vfsModule = require('pdfmake/js/virtual-fs');
const virtualFs = vfsModule.default ?? vfsModule;
const urlModule = require('pdfmake/js/URLResolver');
const URLResolver = urlModule.default ?? urlModule;
/* eslint-enable @typescript-eslint/no-var-requires */

const BLEU = '#0F4C81';
const GRIS = '#64748B';
const GRIS_CLAIR = '#94A3B8';

/** Ce qui a fait entrer l'argent, en clair — un reçu doit se lire seul. */
const LIBELLE_ENTREE: Record<string, string> = {
  REMBOURSEMENT_BON: "Retour d'un bon non dépensé",
  ENCAISSEMENT: 'Encaissement',
  AJUSTEMENT: 'Ajustement de budget',
  RECHARGE: 'Recharge',
  TRANSFERT: 'Transfert',
  REMBOURSEMENT_CREDIT: 'Remboursement de crédit',
  SALAIRE: 'Salaire',
  CREDIT: 'Crédit',
};

/**
 * Reçu de réception au format PDF.
 *
 * Fabriqué par le SERVEUR, et c'est tout l'intérêt : le fichier est identique
 * quel que soit le poste, alors que l'impression navigateur dépend des marges,
 * des en-têtes et des polices de chaque machine. Une pièce comptable doit se
 * retrouver à l'identique dans six mois.
 *
 * Polices standard PDF (Helvetica) plutôt que celles embarquées par pdfmake :
 * elles sont garanties par le format lui-même, ne pèsent rien, et couvrent le
 * français accentué dont nous avons besoin.
 */
@Injectable()
export class RecuPdfService {
  private readonly printer = new PdfPrinter(
    {
      Helvetica: {
        normal: 'Helvetica',
        bold: 'Helvetica-Bold',
        italics: 'Helvetica-Oblique',
        bolditalics: 'Helvetica-BoldOblique',
      },
    },
    virtualFs,
    new URLResolver(virtualFs),
  );

  private montant(valeur: string, devise?: string | null): string {
    const n = Number(valeur || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 });
    return `${n} ${devise ?? ''}`.trim();
  }

  /** Un couple étiquette / valeur, tel qu'il se répète dans le corps du reçu. */
  private champ(etiquette: string, valeur?: string | null): any {
    return {
      stack: [
        { text: etiquette.toUpperCase(), fontSize: 7, color: GRIS_CLAIR, characterSpacing: 0.6 },
        { text: valeur && valeur.trim() ? valeur : '—', fontSize: 11, bold: true, margin: [0, 2, 0, 0] },
      ],
    };
  }

  async generer(recu: RecuCaisse): Promise<Buffer> {
    const date = new Date(recu.createdAt);
    const nature = LIBELLE_ENTREE[recu.typeEntree ?? ''] ?? recu.typeEntree ?? 'Entrée en caisse';

    const doc = {
      pageSize: 'A4',
      pageMargins: [45, 45, 45, 45] as [number, number, number, number],
      defaultStyle: { font: 'Helvetica', fontSize: 10, color: '#0F172A' },
      content: [
        {
          columns: [
            {
              stack: [
                { text: 'NPG GANDOUR', bold: true, fontSize: 16, color: BLEU },
                { text: 'Fond de Caisse — Reçu de réception', fontSize: 9, color: GRIS, margin: [0, 2, 0, 0] },
              ],
            },
            {
              width: 'auto',
              stack: [
                { text: recu.numero, bold: true, fontSize: 15, color: BLEU, alignment: 'right' },
                {
                  text: `Abidjan, le ${date.toLocaleDateString('fr-FR')}`,
                  fontSize: 9,
                  color: GRIS,
                  alignment: 'right',
                  margin: [0, 3, 0, 0],
                },
              ],
            },
          ],
        },
        // Filet sous l'en-tête, dessiné plutôt que bordé : une bordure de
        // tableau imposerait une cellule vide qui décalerait tout le reste.
        { canvas: [{ type: 'line', x1: 0, y1: 6, x2: 505, y2: 6, lineWidth: 2, lineColor: BLEU }] },

        { text: nature, fontSize: 11, color: GRIS, margin: [0, 14, 0, 0] },

        // Le montant, isolé et en grand : c'est ce qu'on lit en premier.
        {
          table: {
            widths: ['*'],
            body: [
              [
                {
                  text: this.montant(recu.montant, recu.deviseCode),
                  fontSize: 21,
                  bold: true,
                  color: '#FFFFFF',
                  alignment: 'center',
                  fillColor: BLEU,
                  margin: [0, 12, 0, 12],
                },
              ],
            ],
          },
          layout: 'noBorders',
          margin: [0, 12, 0, 16],
        },

        {
          columns: [this.champ('Caisse', recu.caisseLibelle), this.champ('Reçu par', recu.encaissePar)],
          columnGap: 24,
        },
        {
          columns: [this.champ('Remis par', recu.remisPar), this.champ('Motif', recu.motif)],
          columnGap: 24,
          margin: [0, 14, 0, 0],
        },

        // DEUX signatures : un reçu qu'une seule partie signe ne prouve rien.
        {
          columns: [
            {
              stack: [
                { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 220, y2: 0, lineWidth: 1, lineColor: GRIS_CLAIR }] },
                { text: 'Signature de la personne qui remet', fontSize: 9, color: GRIS, margin: [0, 5, 0, 0] },
              ],
            },
            {
              stack: [
                { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 220, y2: 0, lineWidth: 1, lineColor: GRIS_CLAIR }] },
                { text: 'Signature du caissier', fontSize: 9, color: GRIS, margin: [0, 5, 0, 0] },
              ],
            },
          ],
          columnGap: 24,
          margin: [0, 70, 0, 0],
        },
      ],
      footer: {
        text: 'Fond de Caisse — NPG Gandour · reçu émis automatiquement, non modifiable',
        fontSize: 8,
        color: GRIS_CLAIR,
        alignment: 'center',
        margin: [0, 12, 0, 0],
      },
    };

    // pdfmake écrit en flux ; on rassemble avant de renvoyer, le contrôleur
    // devant fixer la longueur du corps de la réponse.
    // `createPdfKitDocument` rend une PROMESSE en 0.3 : l'attendre avant de
    // brancher les écouteurs, sinon on écoute un objet Promise.
    const pdf = await this.printer.createPdfKitDocument(doc);
    return new Promise<Buffer>((resolve, reject) => {
      const morceaux: Buffer[] = [];
      pdf.on('data', (m: Buffer) => morceaux.push(m));
      pdf.on('end', () => resolve(Buffer.concat(morceaux)));
      pdf.on('error', reject);
      pdf.end();
    });
  }
}
