import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Devise } from './entities/devise.entity';
import { CreateDeviseDto } from './dto/create-devise.dto';
import { UpdateDeviseDto } from './dto/update-devise.dto';
import { ParametresService } from '@modules/referentiel/parametres.service';

@Injectable()
export class DevisesService {
  constructor(
    @InjectRepository(Devise)
    private readonly deviseRepo: Repository<Devise>,
    private readonly parametres: ParametresService,
  ) {}

  /**
   * `includeInactive` sert l'écran d'administration, qui doit pouvoir réactiver
   * une devise désactivée. Le filtre est appliqué EN BASE, pas après coup.
   */
  findAll(includeInactive = false): Promise<Devise[]> {
    return this.deviseRepo.find({
      where: includeInactive ? {} : { estActif: true },
      order: { code: 'ASC' },
    });
  }

  async findOne(id: string): Promise<Devise> {
    const devise = await this.deviseRepo.findOne({ where: { id } });
    if (!devise) throw new NotFoundException(`Devise ${id} introuvable`);
    return devise;
  }

  /** Nombre d'écritures comptables libellées dans cette devise. */
  private async nbEcritures(deviseId: string): Promise<number> {
    const r = await this.deviseRepo.manager.query(
      'SELECT COUNT(*) AS n FROM dbo.trx_ecriture_comptable WHERE devise_id = @0',
      [deviseId],
    );
    return Number(r?.[0]?.n ?? 0);
  }

  /** Comptes qui DÉCLARENT cette devise (caisse = devise du coffre, portefeuille = sa monnaie). */
  private async comptesQuiLaDeclarent(deviseId: string): Promise<string[]> {
    const bloquants: string[] = [];
    const checks: Array<[string, string]> = [
      ['caisse(s)', 'SELECT COUNT(*) AS n FROM dbo.fin_caisse WHERE devise_id = @0 AND deleted_at IS NULL'],
      ['portefeuille(s)', 'SELECT COUNT(*) AS n FROM dbo.fin_portefeuille WHERE devise_id = @0 AND deleted_at IS NULL'],
    ];
    for (const [label, sql] of checks) {
      const r = await this.deviseRepo.manager.query(sql, [deviseId]);
      const n = Number(r?.[0]?.n ?? 0);
      if (n > 0) bloquants.push(`${n} ${label}`);
    }
    return bloquants;
  }

  async create(dto: CreateDeviseDto): Promise<Devise> {
    const existing = await this.deviseRepo.findOne({ where: { code: dto.code } });
    if (existing) {
      throw new ConflictException(`La devise ${dto.code} existe déjà (${existing.libelle}).`);
    }
    return this.deviseRepo.save(
      this.deviseRepo.create({
        code: dto.code,
        libelle: dto.libelle,
        symbole: dto.symbole ?? null,
        nbDecimales: dto.nbDecimales ?? 2,
        estActif: true,
      }),
    );
  }

  async update(id: string, dto: UpdateDeviseDto): Promise<Devise> {
    const devise = await this.findOne(id);

    if (dto.libelle !== undefined) devise.libelle = dto.libelle;
    if (dto.symbole !== undefined) devise.symbole = dto.symbole || null;

    // Le nombre de décimales gouverne l'arrondi des conversions, et cet arrondi
    // est FIGÉ dans chaque écriture. Le changer après coup ferait diverger les
    // montants déjà enregistrés de la règle censée les avoir produits : le même
    // encaissement ne serait plus reproductible.
    if (dto.nbDecimales !== undefined && dto.nbDecimales !== devise.nbDecimales) {
      const n = await this.nbEcritures(id);
      if (n > 0) {
        throw new BadRequestException(
          `Impossible de changer les décimales de ${devise.code} : ${n} écriture(s) ont déjà été arrondies ` +
            `selon la règle actuelle. Créez une nouvelle devise si le format doit changer.`,
        );
      }
      devise.nbDecimales = dto.nbDecimales;
    }

    if (dto.estActif !== undefined && dto.estActif !== devise.estActif) {
      if (!dto.estActif) await this.assertDesactivable(devise);
      devise.estActif = dto.estActif;
    }

    return this.deviseRepo.save(devise);
  }

  /**
   * Une devise se désactive, ne se supprime pas : ses écritures passées restent
   * lisibles. Encore faut-il que plus rien d'actif ne s'appuie dessus.
   */
  private async assertDesactivable(devise: Devise): Promise<void> {
    const reference = (await this.parametres.get('DEVISE_REFERENCE')) ?? 'XOF';
    if (devise.code === reference) {
      throw new BadRequestException(
        `${devise.code} est la devise de référence de l'application : toutes les conversions passent par elle. ` +
          `Changez le paramètre DEVISE_REFERENCE avant de la désactiver.`,
      );
    }
    const bloquants = await this.comptesQuiLaDeclarent(String(devise.id));
    if (bloquants.length) {
      throw new BadRequestException(
        `Impossible de désactiver ${devise.code} : ${bloquants.join(', ')} la déclarent encore. ` +
          `Basculez-les sur une autre devise d'abord.`,
      );
    }
  }
}
