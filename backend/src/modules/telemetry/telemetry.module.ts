import { Module } from '@nestjs/common';
import { TelemetryController } from './telemetry.controller';

/** Réception de la télémétrie d'interface (suivi des tests) → fichiers ui-*.jsonl. */
@Module({
  controllers: [TelemetryController],
})
export class TelemetryModule {}
