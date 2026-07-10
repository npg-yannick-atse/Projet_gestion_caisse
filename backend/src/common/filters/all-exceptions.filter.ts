import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';
import { testLogger } from '@common/logging/test-logger';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | object = 'Erreur interne du serveur';
    let code = 'INTERNAL_ERROR';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const resp = exception.getResponse();
      message = typeof resp === 'string' ? resp : (resp as any).message ?? resp;
      code = (resp as any)?.error ?? exception.constructor.name;
    } else if (exception instanceof QueryFailedError) {
      status = HttpStatus.BAD_REQUEST;
      message = exception.message;
      code = 'DB_QUERY_FAILED';
      this.logger.error(`SQL: ${(exception as any).query ?? ''}`, exception.stack);
    } else if (exception instanceof Error) {
      message = exception.message;
      this.logger.error(exception.message, exception.stack);
    }

    // Journal FICHIER des erreurs (suivi des tests) : on ne consigne que les vraies
    // erreurs serveur / inattendues (avec stack). Les erreurs « client » 4xx
    // (validation, autorisation…) restent dans le journal d'accès (level warn).
    if (!(exception instanceof HttpException) || status >= 500) {
      testLogger.error({
        ts: new Date().toISOString(),
        status,
        code,
        method: request.method,
        path: String(request.originalUrl || request.url || '').split('?')[0],
        userId: (request as { user?: { sub?: string } }).user?.sub ?? null,
        message: typeof message === 'string' ? message : JSON.stringify(message),
        stack: exception instanceof Error ? exception.stack : undefined,
      });
    }

    response.status(status).json({
      statusCode: status,
      code,
      message,
      path: request.url,
      method: request.method,
      timestamp: new Date().toISOString(),
    });
  }
}
