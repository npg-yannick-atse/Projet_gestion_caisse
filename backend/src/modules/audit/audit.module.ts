import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
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
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';
import { AuditInterceptor } from './audit.interceptor';
import { SecurityModule } from '@modules/security/security.module';

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
    SecurityModule,
  ],
  controllers: [AuditController],
  providers: [AuditService, { provide: APP_INTERCEPTOR, useClass: AuditInterceptor }],
  exports: [TypeOrmModule, AuditService],
})
export class AuditModule {}
