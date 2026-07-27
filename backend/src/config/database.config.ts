import { registerAs } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export default registerAs(
  'database',
  (): TypeOrmModuleOptions => ({
    type: 'mssql',
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '1433', 10),
    username: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    options: {
      encrypt: process.env.DB_ENCRYPT === 'true',
      trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE !== 'false',
      enableArithAbort: true,
      // Identité de connexion de l'app (APP_NAME côté SQL) : sert aux triggers qui
      // n'autorisent la modification des tables de sécurité qu'à cette application.
      // Runtime, migrations et seeds partagent cette config → tous reconnus.
      appName: 'fdc-backend',
    },
    pool: {
      max: 20,
      min: 2,
      idleTimeoutMillis: 30000,
    },
    autoLoadEntities: true,
    synchronize: process.env.DB_SYNCHRONIZE === 'true',
    logging: process.env.DB_LOGGING === 'true' ? ['query', 'error', 'warn'] : ['error'],
    extra: {
      requestTimeout: 30000,
      connectionTimeout: 15000,
    },
  }),
);
