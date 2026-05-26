import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Bon } from './entities/bon.entity';
import { SousBon } from './entities/sous-bon.entity';
import { ValidationBon } from './entities/validation-bon.entity';
import { ImpressionBon } from './entities/impression-bon.entity';
import { BonCaisse } from './entities/bon-caisse.entity';
import { Decaissement } from './entities/decaissement.entity';
import { Operation } from './entities/operation.entity';
import { Transfert } from './entities/transfert.entity';
import { EcritureComptable } from './entities/ecriture-comptable.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Bon,
      SousBon,
      ValidationBon,
      ImpressionBon,
      BonCaisse,
      Decaissement,
      Operation,
      Transfert,
      EcritureComptable,
    ]),
  ],
  exports: [TypeOrmModule],
})
export class TransactionnelModule {}
