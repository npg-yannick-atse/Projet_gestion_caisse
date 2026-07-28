import { Module } from '@nestjs/common';
import { SapService } from './sap.service';
import { SapController } from './sap.controller';

/**
 * Intégration SAP (RFC via node-rfc). Lecture / vérification pour l'instant
 * (client, commande) ; le posting comptable viendra dans un second temps.
 */
@Module({
  providers: [SapService],
  controllers: [SapController],
  exports: [SapService],
})
export class SapModule {}
