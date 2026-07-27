import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { EmployesService } from './employes.service';
import {
  CreateEmployeBeneficeDto,
  CreateEmployeDto,
  CreateTypeBeneficeDto,
  UpdateEmployeBeneficeDto,
  UpdateEmployeDto,
  UpdateTypeBeneficeDto,
} from './dto/employe.dto';
import { Employe } from './entities/employe.entity';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '@modules/auth/decorators/current-user.decorator';
import { AuthorizationService } from '@modules/security/authorization.service';

@ApiTags('Référentiel / Employés')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class EmployesController {
  constructor(
    private readonly employes: EmployesService,
    private readonly authz: AuthorizationService,
  ) {}

  /**
   * Retire le salaire de la réponse si l'appelant n'a pas EMPLOYE_VOIR_SALAIRE.
   * Le filtrage est fait ICI, côté serveur : masquer la colonne dans le
   * navigateur ne suffirait pas, la valeur transiterait quand même sur le
   * réseau et serait lisible dans les outils de développement.
   * Rappel : les admins (SUPER_ADMIN / ADMINISTRATEUR / DAF) passent d'office.
   */
  private async filtrerSalaire<T extends Employe | Employe[]>(data: T, userId: string): Promise<T> {
    if (await this.authz.hasPermission(userId, 'EMPLOYE_VOIR_SALAIRE')) return data;
    if (await this.authz.isAdmin(userId)) return data;
    const sansSalaire = (e: Employe) => ({ ...e, salaire: null });
    return (Array.isArray(data) ? data.map(sansSalaire) : sansSalaire(data)) as T;
  }

  /* ----------------------------------------------------------- Employés -- */

  @Get('employes')
  @ApiOperation({ summary: 'Lister les employés (recherche, filtre direction et tri exécutés en base)' })
  async listEmployes(
    @CurrentUser() user: JwtPayload,
    @Query('search') search?: string,
    @Query('directionId') directionId?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: string,
  ) {
    const list = await this.employes.listEmployes({
      search,
      directionId,
      sortBy,
      sortDir: sortDir === 'desc' ? 'desc' : sortDir === 'asc' ? 'asc' : undefined,
    });
    return this.filtrerSalaire(list, user.sub);
  }

  @Post('employes/import/apercu')
  @ApiOperation({ summary: "Aperçu (dry-run) d'un import : parse le fichier sans rien enregistrer" })
  async apercuImport(@Body() body: { fileBase64: string }, @CurrentUser() user: JwtPayload) {
    await this.authz.assertPermission(user.sub, 'EMPLOYE_GERER', 'importer des employés');
    return this.employes.apercuImport(body?.fileBase64 ?? '');
  }

  @Post('employes/import')
  @ApiOperation({ summary: 'Importer des employés depuis un fichier Excel (base64)' })
  async importEmployes(@Body() body: { fileBase64: string }, @CurrentUser() user: JwtPayload) {
    await this.authz.assertPermission(user.sub, 'EMPLOYE_GERER', 'importer des employés');
    return this.employes.importEmployes(body?.fileBase64 ?? '', user.sub);
  }

  @Get('employes/import/modele')
  @ApiOperation({ summary: "Télécharger un modèle Excel d'import d'employés" })
  async modeleImport(@CurrentUser() user: JwtPayload, @Res({ passthrough: true }) res: Response) {
    await this.authz.assertPermission(user.sub, 'EMPLOYE_GERER', 'importer des employés');
    const buf = await this.employes.modeleImport();
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="modele_import_employes.xlsx"',
    });
    return new StreamableFile(buf);
  }

  @Get('employes/export')
  @ApiOperation({ summary: 'Exporter les employés au format Excel (respecte recherche/filtre/tri)' })
  async exportEmployes(
    @CurrentUser() user: JwtPayload,
    @Res({ passthrough: true }) res: Response,
    @Query('search') search?: string,
    @Query('directionId') directionId?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: string,
  ) {
    await this.authz.assertPermission(user.sub, 'EMPLOYE_GERER', 'exporter les employés');
    const voitSalaire =
      (await this.authz.hasPermission(user.sub, 'EMPLOYE_VOIR_SALAIRE')) ||
      (await this.authz.isAdmin(user.sub));
    const buf = await this.employes.exportEmployes(
      {
        search,
        directionId,
        sortBy,
        sortDir: sortDir === 'desc' ? 'desc' : sortDir === 'asc' ? 'asc' : undefined,
      },
      !voitSalaire,
    );
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="employes.xlsx"',
    });
    return new StreamableFile(buf);
  }

  @Get('employes/:id')
  @ApiOperation({ summary: 'Détail d’un employé' })
  async findEmploye(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    const e = await this.employes.findEmploye(id);
    return this.filtrerSalaire(e, user.sub);
  }

  @Post('employes')
  @ApiOperation({ summary: 'Créer un employé' })
  async createEmploye(@Body() dto: CreateEmployeDto, @CurrentUser() user: JwtPayload) {
    await this.authz.assertPermission(user.sub, 'EMPLOYE_GERER', 'créer un employé');
    const e = await this.employes.createEmploye(dto, user.sub);
    return this.filtrerSalaire(e, user.sub);
  }

  @Patch('employes/:id')
  @ApiOperation({ summary: 'Mettre à jour un employé' })
  async updateEmploye(@Param('id') id: string, @Body() dto: UpdateEmployeDto, @CurrentUser() user: JwtPayload) {
    await this.authz.assertPermission(user.sub, 'EMPLOYE_GERER', 'modifier un employé');
    // Modifier le salaire suppose le droit de le voir.
    if (dto.salaire !== undefined) {
      await this.authz.assertPermission(user.sub, 'EMPLOYE_VOIR_SALAIRE', 'modifier le salaire');
    }
    const e = await this.employes.updateEmploye(id, dto, user.sub);
    return this.filtrerSalaire(e, user.sub);
  }

  @Delete('employes/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Désactiver un employé' })
  async deleteEmploye(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.authz.assertPermission(user.sub, 'EMPLOYE_GERER', 'supprimer un employé');
    await this.employes.deleteEmploye(id, user.sub);
  }

  /* -------------------------------------------------- Types de bénéfice -- */

  @Get('types-benefice')
  @ApiOperation({ summary: 'Lister les types de bénéfice (recherche + tri en base)' })
  listTypesBenefice(@Query('search') search?: string, @Query('sortBy') sortBy?: string, @Query('sortDir') sortDir?: string) {
    return this.employes.listTypesBenefice({
      search,
      sortBy,
      sortDir: sortDir === 'desc' ? 'desc' : sortDir === 'asc' ? 'asc' : undefined,
    });
  }

  @Post('types-benefice')
  @ApiOperation({ summary: 'Créer un type de bénéfice' })
  async createTypeBenefice(@Body() dto: CreateTypeBeneficeDto, @CurrentUser() user: JwtPayload) {
    await this.authz.assertPermission(user.sub, 'EMPLOYE_GERER', 'créer un type de bénéfice');
    return this.employes.createTypeBenefice(dto, user.sub);
  }

  @Patch('types-benefice/:id')
  @ApiOperation({ summary: 'Mettre à jour un type de bénéfice' })
  async updateTypeBenefice(@Param('id') id: string, @Body() dto: UpdateTypeBeneficeDto, @CurrentUser() user: JwtPayload) {
    await this.authz.assertPermission(user.sub, 'EMPLOYE_GERER', 'modifier un type de bénéfice');
    return this.employes.updateTypeBenefice(id, dto, user.sub);
  }

  @Delete('types-benefice/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Désactiver un type de bénéfice' })
  async deleteTypeBenefice(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.authz.assertPermission(user.sub, 'EMPLOYE_GERER', 'supprimer un type de bénéfice');
    await this.employes.deleteTypeBenefice(id, user.sub);
  }

  /* ---------------------------------------------- Bénéfices d'un employé -- */

  @Get('employes/:id/benefices')
  @ApiOperation({ summary: 'Lister les bénéfices d’un employé (valides puis historique)' })
  listBenefices(@Param('id') id: string) {
    return this.employes.listBenefices(id);
  }

  @Post('employes/:id/benefices')
  @ApiOperation({ summary: 'Accorder un bénéfice (refusé si ce type est déjà valide pour l’employé)' })
  async createBenefice(
    @Param('id') id: string,
    @Body() dto: CreateEmployeBeneficeDto,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.authz.assertPermission(user.sub, 'EMPLOYE_GERER', 'accorder un bénéfice');
    return this.employes.createBenefice(id, dto, user.sub);
  }

  @Patch('benefices/:id')
  @ApiOperation({ summary: 'Mettre à jour un bénéfice (dont activation / désactivation)' })
  async updateBenefice(
    @Param('id') id: string,
    @Body() dto: UpdateEmployeBeneficeDto,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.authz.assertPermission(user.sub, 'EMPLOYE_GERER', 'modifier un bénéfice');
    return this.employes.updateBenefice(id, dto, user.sub);
  }

  @Delete('benefices/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Désactiver un bénéfice' })
  async deleteBenefice(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.authz.assertPermission(user.sub, 'EMPLOYE_GERER', 'supprimer un bénéfice');
    await this.employes.deleteBenefice(id, user.sub);
  }
}
