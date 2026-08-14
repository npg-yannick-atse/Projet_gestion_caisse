import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SecurityModule } from '@modules/security/security.module';
import { PlanComptable } from './entities/plan-comptable.entity';
import { CostCenter } from './entities/cost-center.entity';
import { NatureComptable } from './entities/nature-comptable.entity';
import { NatureComptableCostCenter } from './entities/nature-comptable-cost-center.entity';
import { Partenaire } from './entities/partenaire.entity';
import { PartenaireNatureComptable } from './entities/partenaire-nature-comptable.entity';
import { Site } from './entities/site.entity';
import { TypeBon } from './entities/type-bon.entity';
import { Pays } from './entities/pays.entity';
import { Division } from './entities/division.entity';
import { Employe } from './entities/employe.entity';
import { TypeBenefice } from './entities/type-benefice.entity';
import { EmployeBenefice } from './entities/employe-benefice.entity';
import { EmployeSalaire } from './entities/employe-salaire.entity';
import { Parametre } from './entities/parametre.entity';
import { ReferentielService } from './referentiel.service';
import { ReferentielController } from './referentiel.controller';
import { EmployesService } from './employes.service';
import { EmployesController } from './employes.controller';
import { ParametresService } from './parametres.service';
import { ParametresController } from './parametres.controller';

@Module({
  imports: [
    SecurityModule,
    TypeOrmModule.forFeature([
      PlanComptable,
      CostCenter,
      NatureComptable,
      NatureComptable,
      NatureComptableCostCenter,
      Partenaire,
      PartenaireNatureComptable,
      Site,
      TypeBon,
      Pays,
      Division,
      Employe,
      TypeBenefice,
      EmployeBenefice,
      EmployeSalaire,
      Parametre,
    ]),
  ],
  providers: [ReferentielService, EmployesService, ParametresService],
  controllers: [ReferentielController, EmployesController, ParametresController],
  exports: [ReferentielService, EmployesService, ParametresService, TypeOrmModule],
})
export class ReferentielModule {}
