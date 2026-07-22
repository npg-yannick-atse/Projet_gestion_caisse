import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Devise } from './entities/devise.entity';
import { TauxEchange } from './entities/taux-echange.entity';
import { Caisse } from './entities/caisse.entity';
import { SessionCaisse } from './entities/session-caisse.entity';
import { Portefeuille } from './entities/portefeuille.entity';
import { CompteGainChange } from './entities/compte-gain-change.entity';
import { ComptePerteChange } from './entities/compte-perte-change.entity';
import { DemandeTransfert } from './entities/demande-transfert.entity';
import { DemandeRecharge } from './entities/demande-recharge.entity';
import { Credit } from './entities/credit.entity';
import { Employe } from '@modules/referentiel/entities/employe.entity';
import { CaissesService } from './caisses.service';
import { CreditService } from './credit.service';
import { CreditController } from './credit.controller';
import { CaissesController } from './caisses.controller';
import { RechargeService } from './recharge.service';
import { RechargeController } from './recharge.controller';
import { EncaissementService } from './encaissement.service';
import { EncaissementController } from './encaissement.controller';
import { DevisesService } from './devises.service';
import { DevisesController } from './devises.controller';
import { PortefeuillesService } from './portefeuilles.service';
import { PortefeuillesController } from './portefeuilles.controller';
import { DemandesTransfertService } from './demandes-transfert.service';
import { DemandesTransfertController } from './demandes-transfert.controller';
import { DemandesRechargeService } from './demandes-recharge.service';
import { DemandesRechargeController } from './demandes-recharge.controller';
import { CaisseAutoCloseJob } from './jobs/caisse-auto-close.job';
import { TransactionnelModule } from '@modules/transactionnel/transactionnel.module';
import { SecurityModule } from '@modules/security/security.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Devise,
      TauxEchange,
      Caisse,
      SessionCaisse,
      Portefeuille,
      CompteGainChange,
      ComptePerteChange,
      DemandeTransfert,
      DemandeRecharge,
      Credit,
      Employe,
    ]),
    TransactionnelModule,
    SecurityModule,
  ],
  providers: [
    CaissesService,
    RechargeService,
    EncaissementService,
    CreditService,
    DevisesService,
    PortefeuillesService,
    DemandesTransfertService,
    DemandesRechargeService,
    CaisseAutoCloseJob,
  ],
  controllers: [
    CaissesController,
    RechargeController,
    EncaissementController,
    CreditController,
    DevisesController,
    PortefeuillesController,
    DemandesTransfertController,
    DemandesRechargeController,
  ],
  exports: [
    CaissesService,
    RechargeService,
    DevisesService,
    PortefeuillesService,
    DemandesTransfertService,
    DemandesRechargeService,
    TypeOrmModule,
  ],
})
export class FinancierModule {}
