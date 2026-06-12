import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import appConfig from '@config/app.config';
import databaseConfig from '@config/database.config';
import jwtConfig from '@config/jwt.config';
import ldapConfig from '@config/ldap.config';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { AuthModule } from '@modules/auth/auth.module';
import { SecurityModule } from '@modules/security/security.module';
import { ReferentielModule } from '@modules/referentiel/referentiel.module';
import { FinancierModule } from '@modules/financier/financier.module';
import { TransactionnelModule } from '@modules/transactionnel/transactionnel.module';
import { AuditModule } from '@modules/audit/audit.module';
import { NotificationsModule } from '@modules/notifications/notifications.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, jwtConfig, ldapConfig],
      envFilePath: ['.env.local', '.env'],
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService): TypeOrmModuleOptions =>
        config.get<TypeOrmModuleOptions>('database')!,
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    AuthModule,
    SecurityModule,
    ReferentielModule,
    FinancierModule,
    TransactionnelModule,
    AuditModule,
    NotificationsModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
