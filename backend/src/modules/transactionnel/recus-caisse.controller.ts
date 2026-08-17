import { Controller, Get, NotFoundException, Param, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { RecuCaisse } from './entities/recu-caisse.entity';
import { RecuPdfService } from './recu-pdf.service';

/**
 * Consultation des reçus de réception.
 *
 * LECTURE SEULE, et c'est délibéré : un reçu constate une écriture, il ne se
 * crée ni ne se modifie à la main. L'émettre revient à faire entrer de l'argent.
 */
@ApiTags('Reçus de caisse')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('recus-caisse')
export class RecusCaisseController {
  constructor(
    @InjectRepository(RecuCaisse)
    private readonly repo: Repository<RecuCaisse>,
    private readonly pdf_: RecuPdfService,
  ) {}

  /** Résout les libellés en BASE — l'écran d'impression ne doit rien recomposer. */
  private async nommer(recus: RecuCaisse[]): Promise<RecuCaisse[]> {
    if (recus.length === 0) return recus;
    const ids = [...new Set(recus.map((r) => String(r.id)))];
    const ph = ids.map((_, i) => `@${i}`).join(', ');
    const lignes: Array<{ id: string; caisse: string; devise: string; agent: string | null }> =
      await this.repo.query(
        `SELECT r.id,
                CONCAT(c.code, ' — ', c.libelle) AS caisse,
                d.code AS devise,
                CONCAT(u.prenom, ' ', u.nom) AS agent
           FROM dbo.trx_recu_caisse r
           JOIN dbo.fin_caisse c ON c.id = r.caisse_id
           JOIN dbo.fin_devise d ON d.id = r.devise_id
           LEFT JOIN dbo.sec_user u ON u.id = r.created_by_id
          WHERE r.id IN (${ph})`,
        ids,
      );
    const parId = new Map(lignes.map((l) => [String(l.id), l]));
    for (const r of recus) {
      const l = parId.get(String(r.id));
      r.caisseLibelle = l?.caisse ?? null;
      r.deviseCode = l?.devise ?? null;
      r.encaissePar = l?.agent ?? null;
    }
    return recus;
  }

  @Get()
  @ApiOperation({ summary: 'Lister les reçus, filtrés en base par caisse' })
  async lister(@Query('caisseId') caisseId?: string, @Query('limit') limit?: string) {
    const qb = this.repo.createQueryBuilder('r').orderBy('r.id', 'DESC');
    if (caisseId) qb.where('r.caisse_id = :c', { c: caisseId });
    qb.take(limit ? Math.min(Number(limit), 500) : 100);
    return this.nommer(await qb.getMany());
  }

  @Get(':id/pdf')
  @ApiOperation({
    summary: 'Le reçu au format PDF',
    description:
      "Fabriqué par le serveur : le fichier est identique quel que soit le poste, alors que " +
      "l'impression navigateur dépend des marges, en-têtes et polices de chaque machine.",
  })
  async pdf(@Param('id') id: string, @Res() res: Response) {
    const recu = await this.repo.findOne({ where: { id: id as any } });
    if (!recu) throw new NotFoundException(`Reçu ${id} introuvable`);
    const [avecLibelles] = await this.nommer([recu]);
    const fichier = await this.pdf_.generer(avecLibelles);

    // `inline` : le navigateur l'affiche au lieu de le télécharger d'office —
    // on vérifie un reçu bien plus souvent qu'on ne l'archive, et le
    // téléchargement reste à un clic.
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${avecLibelles.numero}.pdf"`);
    res.setHeader('Content-Length', String(fichier.length));
    res.end(fichier);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Un reçu, avec ses libellés résolus (impression)' })
  async detail(@Param('id') id: string) {
    const recu = await this.repo.findOne({ where: { id: id as any } });
    if (!recu) throw new NotFoundException(`Reçu ${id} introuvable`);
    return (await this.nommer([recu]))[0];
  }
}
