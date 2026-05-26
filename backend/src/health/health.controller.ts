import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Public } from '@modules/auth/decorators/public.decorator';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Liveness probe' })
  liveness() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Public()
  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe (verifie la connexion DB)' })
  async readiness() {
    try {
      await this.ds.query('SELECT 1 AS ok');
      return { status: 'ok', db: 'up', timestamp: new Date().toISOString() };
    } catch (err) {
      return {
        status: 'degraded',
        db: 'down',
        error: (err as Error).message,
        timestamp: new Date().toISOString(),
      };
    }
  }
}
