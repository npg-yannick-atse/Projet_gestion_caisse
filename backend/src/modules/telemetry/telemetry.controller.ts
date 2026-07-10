import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import { CurrentUser, JwtPayload } from '@modules/auth/decorators/current-user.decorator';
import { testLogger } from '@common/logging/test-logger';

interface UiEvent {
  type?: string; // 'page' | 'click' | 'submit' | …
  path?: string;
  label?: string;
  ts?: string;
}

/**
 * Réception de la télémétrie d'INTERFACE (clics, navigations) remontée par le frontend.
 * Écrit dans les fichiers ui-YYYY-MM-DD.jsonl (suivi des tests). Batché côté client.
 * Exclu du throttling (envois réguliers) ; nécessite un JWT (attribution au testeur).
 */
@ApiTags('Télémétrie')
@Controller('telemetry')
@SkipThrottle()
export class TelemetryController {
  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Enregistrer un lot d'événements d'interface (clics, navigation)" })
  ingest(
    @Body() body: { events?: UiEvent[] },
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ): void {
    const events = Array.isArray(body?.events) ? body.events.slice(0, 100) : [];
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip ||
      req.socket?.remoteAddress ||
      null;

    for (const e of events) {
      testLogger.ui({
        ts: typeof e?.ts === 'string' ? e.ts : new Date().toISOString(),
        type: String(e?.type ?? 'event').slice(0, 40),
        path: e?.path ? String(e.path).slice(0, 300) : null,
        label: e?.label ? String(e.label).slice(0, 200) : null,
        userId: user?.sub ?? null,
        matricule: user?.matricule ?? null,
        ip,
      });
    }
  }
}
