import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SecurityModule } from '@modules/security/security.module';
import { NotificationsModule } from '@modules/notifications/notifications.module';
import { Bon } from './entities/bon.entity';
import { SousBon } from './entities/sous-bon.entity';
import { ValidationBon } from './entities/validation-bon.entity';
import { ImpressionBon } from './entities/impression-bon.entity';
import { BonCaisse } from './entities/bon-caisse.entity';
import { Decaissement } from './entities/decaissement.entity';
import { Operation } from './entities/operation.entity';
import { Transfert } from './entities/transfert.entity';
import { EcritureComptable } from './entities/ecriture-comptable.entity';
import { Carnet } from './entities/carnet.entity';
import { BonManuel } from './entities/bon-manuel.entity';
import { BonsService } from './bons.service';
import { BonsController } from './bons.controller';
import { BonsCaisseService } from './bons-caisse.service';
import { BonsCaisseController } from './bons-caisse.controller';
import { LedgerService } from './ledger.service';
import { LedgerController } from './ledger.controller';
import { BonsManuelsService } from './bons-manuels.service';
import { BonsManuelsController } from './bons-manuels.controller';

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
      Carnet,
      BonManuel,
    ]),
    SecurityModule,
    NotificationsModule,
  ],
  providers: [BonsService, BonsCaisseService, LedgerService, BonsManuelsService],
  controllers: [BonsController, BonsCaisseController, LedgerController, BonsManuelsController],
  exports: [BonsService, BonsCaisseService, LedgerService, TypeOrmModule],
})
export class TransactionnelModule {}
