import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JournalAudit } from './entities/journal.entity';
import { EvenementBon } from './entities/evenement-bon.entity';
import { Outbox } from './entities/outbox.entity';
import { LogSap } from './entities/log-sap.entity';
import { IdempotencyKey } from './entities/idempotency-key.entity';
import { SnapshotJournalier } from './entities/snapshot-journalier.entity';
import { PlanificationRecurrence } from './entities/planification-recurrence.entity';
import { ChangementPermission } from './entities/changement-permission.entity';
import { Notification } from './entities/notification.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      JournalAudit,
      EvenementBon,
      Outbox,
      LogSap,
      IdempotencyKey,
      SnapshotJournalier,
      PlanificationRecurrence,
      ChangementPermission,
      Notification,
    ]),
  ],
  exports: [TypeOrmModule],
})
export class AuditModule {}
