import { networkInterfaces } from 'node:os';
import { NestFactory, Reflector } from '@nestjs/core';
import { ClassSerializerInterceptor, Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from '@common/filters/all-exceptions.filter';
import { TrimPipe } from '@common/pipes/trim.pipe';
import { requestLogger } from '@common/logging/request-logger.middleware';
import { testLogger } from '@common/logging/test-logger';

function getLanIPv4(): string[] {
  const ips: string[] = [];
  for (const ifaces of Object.values(networkInterfaces())) {
    if (!ifaces) continue;
    for (const info of ifaces) {
      if (info.family === 'IPv4' && !info.internal) ips.push(info.address);
    }
  }
  return ips;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn', 'debug', 'verbose'],
  });

  const config = app.get(ConfigService);
  const port = config.get<number>('app.port') ?? 3000;
  const apiPrefix = config.get<string>('app.apiPrefix') ?? 'api/v1';
  const corsOrigins = config.get<string[]>('app.corsOrigins') ?? ['*'];

  app.setGlobalPrefix(apiPrefix);

  app.use(helmet({ contentSecurityPolicy: false }));

  // Journalisation FICHIER (suivi des tests) : une ligne JSONL par requête, sur res 'finish'.
  app.use(requestLogger);

  app.enableCors({
    origin: corsOrigins.includes('*') ? true : corsOrigins,
    credentials: true,
  });

  app.useGlobalPipes(
    // Le TrimPipe s'exécute AVANT le ValidationPipe : un champ rempli d'espaces
    // devient vide et sera donc rejeté par @IsNotEmpty.
    new TrimPipe(),
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));
  app.useGlobalFilters(new AllExceptionsFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Application Fond de Caisse - API')
    .setDescription('API NestJS pour la gestion de caisse, bons et portefeuilles (MCD v2).')
    .setVersion('0.1.0')
    .addBearerAuth()
    .addTag('Auth')
    .addTag('Security / Users')
    .addTag('Health')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup(`${apiPrefix}/docs`, app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  await app.listen(port);
  const hosts = ['localhost', ...getLanIPv4()];
  Logger.log(`fdc-backend ecoute sur le port ${port} (prefixe /${apiPrefix})`, 'Bootstrap');
  for (const host of hosts) {
    Logger.log(`  → http://${host}:${port}/${apiPrefix}`, 'Bootstrap');
  }
  Logger.log(`Swagger UI : http://${hosts[hosts.length - 1] ?? 'localhost'}:${port}/${apiPrefix}/docs`, 'Bootstrap');
  Logger.log(`Logs de test (JSONL) : ${testLogger.directory}`, 'Bootstrap');
}

bootstrap().catch((err) => {
  Logger.error('Erreur fatale au demarrage', err);
  process.exit(1);
});
