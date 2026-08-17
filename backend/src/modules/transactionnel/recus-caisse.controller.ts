import { Controller, Get, NotFoundException, Param, Query, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { RecuCaisse } from './entities/recu-caisse.entity';

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

  @Get(':id')
  @ApiOperation({ summary: 'Un reçu, avec ses libellés résolus (impression)' })
  async detail(@Param('id') id: string) {
    const recu = await this.repo.findOne({ where: { id: id as any } });
    if (!recu) throw new NotFoundException(`Reçu ${id} introuvable`);
    return (await this.nommer([recu]))[0];
  }
}
