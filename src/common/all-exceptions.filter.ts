import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const requestId = res.locals.requestId as string | undefined;

    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let error = 'Internal Server Error';
    let message: string | string[] = 'Internal server error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      error = exception.name;
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else {
        const detail = body as { message?: string | string[]; error?: string };
        message = detail.message ?? exception.message;
        error = detail.error ?? error;
      }
      if ([401, 403, 429].includes(status)) {
        const who = (req as { user?: { id: string; role: string } }).user;
        this.logger.warn(
          `[${requestId}] ${status} ${req.method} ${req.path} user=${who?.id ?? '-'} role=${who?.role ?? '-'} ip=${req.ip}`,
        );
      }
    } else if (isClientError(exception)) {
      // Body parser errors: too large, bad JSON, wrong charset. The caller's fault.
      status = exception.status;
      error = status === 413 ? 'Payload Too Large' : 'Bad Request';
      message =
        status === 413
          ? 'Request body too large'
          : 'Request body could not be read';
    } else {
      this.logger.error(
        `[${requestId}] ${req.method} ${req.path}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    if (status === 429 && !res.getHeader('Retry-After')) {
      // The limiter names its header after the limit that fired. Callers expect the plain name.
      const named = Object.keys(res.getHeaders()).find((h) =>
        h.startsWith('retry-after-'),
      );
      if (named) res.setHeader('Retry-After', String(res.getHeader(named)));
    }

    res.status(status).json({
      statusCode: status,
      error,
      message,
      path: req.path,
      requestId,
      timestamp: new Date().toISOString(),
    });
  }
}

function isClientError(e: unknown): e is { status: number } {
  const status = (e as { status?: unknown } | null)?.status;
  return typeof status === 'number' && status >= 400 && status < 500;
}
