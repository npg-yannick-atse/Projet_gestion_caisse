import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SecurityModule } from '@modules/security/security.module';
import { NotificationsModule } from '@modules/notifications/notifications.module';
import { AuditModule } from '@modules/audit/audit.module';
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
import { ReajustementsService } from './reajustements.service';
import { ReajustementsController } from './reajustements.controller';
import { RecuCaisse } from './entities/recu-caisse.entity';
import { RecusCaisseController } from './recus-caisse.controller';
import { RemboursementBon } from './entities/remboursement-bon.entity';
import { RemboursementsBonService } from './remboursements-bon.service';
import { RemboursementsBonController } from './remboursements-bon.controller';
import { BonManuel } from './entities/bon-manuel.entity';
import { BonRecurrenceJob } from './jobs/bon-recurrence.job';
import { BonsService } from './bons.service';
import { BonsController } from './bons.controller';
import { BonsCaisseService } from './bons-caisse.service';
import { BonsCaisseController } from './bons-caisse.controller';
import { LedgerService } from './ledger.service';
import { LedgerController } from './ledger.controller';
import { BudgetMensuelService } from './budget-mensuel.service';
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
      RemboursementBon,
      RecuCaisse,
    ]),
    SecurityModule,
    NotificationsModule,
    AuditModule,
  ],
  providers: [
    BonsService,
    BonsCaisseService,
    LedgerService,
    BonsManuelsService,
    BudgetMensuelService,
    RemboursementsBonService,
    ReajustementsService,
    // Rappel quotidien des bons récurrents (@Cron 7h, fuseau Abidjan).
    BonRecurrenceJob,
  ],
  controllers: [
    BonsController,
    BonsCaisseController,
    LedgerController,
    BonsManuelsController,
    RemboursementsBonController,
    RecusCaisseController,
    ReajustementsController,
  ],
  exports: [BonsService, BonsCaisseService, LedgerService, TypeOrmModule],
})
export class TransactionnelModule {}
