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
    } else {
      this.logger.error(
        `[${requestId}] ${req.method} ${req.path}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
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
