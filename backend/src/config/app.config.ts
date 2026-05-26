import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.APP_PORT || '3000', 10),
  name: process.env.APP_NAME || 'fdc-backend',
  apiPrefix: process.env.API_PREFIX || 'api/v1',
  corsOrigins: (process.env.CORS_ORIGINS || '*').split(',').map((o) => o.trim()),
  logLevel: process.env.LOG_LEVEL || 'debug',
}));
