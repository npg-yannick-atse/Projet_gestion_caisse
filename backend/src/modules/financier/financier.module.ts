import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Devise } from './entities/devise.entity';
import { TauxEchange } from './entities/taux-echange.entity';
import { Caisse } from './entities/caisse.entity';
import { SessionCaisse } from './entities/session-caisse.entity';
import { Portefeuille } from './entities/portefeuille.entity';
import { CompteGainChange } from './entities/compte-gain-change.entity';
import { ComptePerteChange } from './entities/compte-perte-change.entity';

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
    ]),
  ],
  exports: [TypeOrmModule],
})
export class FinancierModule {}
