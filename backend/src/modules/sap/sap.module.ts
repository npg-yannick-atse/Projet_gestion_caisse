import { Module } from '@nestjs/common';
import { SapService } from './sap.service';
import { SapController } from './sap.controller';
import { SecurityModule } from '@modules/security/security.module';

/**
 * Intégration SAP (RFC via node-rfc). Lecture / vérification pour l'instant
 * (client, commande) ; le posting comptable viendra dans un second temps.
 * SecurityModule fournit AuthorizationService (permissions SAP_*).
 */
@Module({
  imports: [SecurityModule],
  providers: [SapService],
  controllers: [SapController],
  exports: [SapService],
})
export class SapModule {}
