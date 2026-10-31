import { type ApiError, DomainError, ErrorCode, type ErrorDetails } from '@baliqbozor/domain';
import { translate } from '@baliqbozor/i18n';
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import type { Request, Response } from 'express';

import { localeFromHeader } from './locale.js';

const STATUS_TO_CODE: Readonly<Record<number, ErrorCode>> = {
  400: ErrorCode.VALIDATION_FAILED,
  401: ErrorCode.UNAUTHORIZED,
  403: ErrorCode.FORBIDDEN,
  404: ErrorCode.NOT_FOUND,
  405: ErrorCode.NOT_FOUND,
  409: ErrorCode.CONFLICT,
  413: ErrorCode.MEDIA_TOO_LARGE,
  415: ErrorCode.MEDIA_TYPE_NOT_ALLOWED,
  429: ErrorCode.RATE_LIMITED,
};

interface Resolved {
  status: number;
  code: ErrorCode;
  details?: ErrorDetails;
}

function resolve(exception: unknown): Resolved {
  if (exception instanceof DomainError) {
    return {
      status: exception.httpStatus,
      code: exception.code,
      ...(exception.details ? { details: exception.details } : {}),
    };
  }
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const code =
      STATUS_TO_CODE[status] ??
      (status >= 500 ? ErrorCode.INTERNAL_ERROR : ErrorCode.VALIDATION_FAILED);
    return { status, code };
  }
  return { status: 500, code: ErrorCode.INTERNAL_ERROR };
}

/** Единый формат ошибок API (SPEC 10.2). Текст — на языке из `Accept-Language`. */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<Request & { id?: string }>();
    const res = http.getResponse<Response>();
    const { status, code, details } = resolve(exception);

    if (status >= 500) {
      this.logger.error(
        exception instanceof Error ? (exception.stack ?? exception.message) : String(exception),
      );
      Sentry.captureException(exception);
    }

    const body: ApiError = {
      error: {
        code,
        message: translate(localeFromHeader(req.headers['accept-language']), `errors.${code}`),
        ...(details ? { details } : {}),
        requestId: String(req.id ?? ''),
      },
    };
    res.status(status).json(body);
  }
}
