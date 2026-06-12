import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlanComptable } from './entities/plan-comptable.entity';
import { CostCenter } from './entities/cost-center.entity';
import { NatureOperation } from './entities/nature-operation.entity';
import { NatureComptable } from './entities/nature-comptable.entity';
import { Partenaire } from './entities/partenaire.entity';
import { PartenaireNatureComptable } from './entities/partenaire-nature-comptable.entity';
import { Site } from './entities/site.entity';
import { TypeBon } from './entities/type-bon.entity';
import { ReferentielService } from './referentiel.service';
import { ReferentielController } from './referentiel.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PlanComptable,
      CostCenter,
      NatureOperation,
      NatureComptable,
      Partenaire,
      PartenaireNatureComptable,
      Site,
      TypeBon,
    ]),
  ],
  providers: [ReferentielService],
  controllers: [ReferentielController],
  exports: [ReferentielService, TypeOrmModule],
})
export class ReferentielModule {}
