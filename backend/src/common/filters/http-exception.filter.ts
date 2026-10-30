import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { captureServerException } from '../observability/sentry.js';

type RequestContext = Request & {
  id?: string;
  user?: { sub?: string; role?: string };
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestContext>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let error = 'InternalServerError';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (typeof body === 'object' && body !== null) {
        const obj = body as Record<string, unknown>;
        message = (obj['message'] as string | string[]) ?? exception.message;
        error = (obj['error'] as string) ?? exception.name;
      }
    } else {
      this.logger.error(
        `Unhandled exception on ${request.method} ${request.url} requestId=${request.id ?? '-'}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    // 4xx responses are expected client errors; only report real failures.
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      captureServerException(exception, {
        requestId: request.id,
        method: request.method,
        path: request.path ?? request.url,
        userId: request.user?.sub,
        role: request.user?.role,
      });
    }

    response.status(status).json({
      statusCode: status,
      error,
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
      requestId: request.id,
    });
  }
}
