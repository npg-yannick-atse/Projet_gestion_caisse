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
  exports: [TypeOrmModule],
})
export class ReferentielModule {}
