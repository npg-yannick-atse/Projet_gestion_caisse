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
import { CreditRemboursement } from './entities/credit-remboursement.entity';
import { SessionCaisseDevise } from './entities/session-caisse-devise.entity';
import { PaiementSalaire } from './entities/paiement-salaire.entity';
import { PaiementSalaireService } from './paiement-salaire.service';
import { PaiementSalaireController } from './paiement-salaire.controller';
import { Employe } from '@modules/referentiel/entities/employe.entity';
import { CaissesService } from './caisses.service';
import { CreditService } from './credit.service';
import { CreditRemboursementService } from './credit-remboursement.service';
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
import { ReferentielModule } from '@modules/referentiel/referentiel.module';

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
      CreditRemboursement,
      Employe,
      PaiementSalaire,
      SessionCaisseDevise,
    ]),
    TransactionnelModule,
    SecurityModule,
    ReferentielModule,
  ],
  providers: [
    CaissesService,
    RechargeService,
    EncaissementService,
    CreditService,
    CreditRemboursementService,
    DevisesService,
    PortefeuillesService,
    DemandesTransfertService,
    DemandesRechargeService,
    CaisseAutoCloseJob,
    PaiementSalaireService,
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
    PaiementSalaireController,
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
