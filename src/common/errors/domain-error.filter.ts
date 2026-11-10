import { type ArgumentsHost, Catch, type ExceptionFilter, HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';
import { DomainError } from '../domain/domain-error.js';

/** The only place that knows how domain error codes map to HTTP status codes. */
const DOMAIN_ERROR_STATUS: Record<string, HttpStatus> = {
  RUN_LIMIT_REACHED: HttpStatus.CONFLICT,
  GMAIL_RUN_ALREADY_ACTIVE: HttpStatus.CONFLICT,
  RUN_NOT_CONTINUABLE: HttpStatus.CONFLICT,
  IMPORT_NOT_CONTINUABLE: HttpStatus.CONFLICT,
  RUN_STILL_ACTIVE: HttpStatus.CONFLICT,
  NO_EMAILS_SELECTED: HttpStatus.UNPROCESSABLE_ENTITY,
  GMAIL_NOT_CONNECTED: HttpStatus.PRECONDITION_FAILED,
  GMAIL_ACCESS_REVOKED: HttpStatus.PRECONDITION_FAILED,
  GMAIL_ACCOUNT_UNKNOWN: HttpStatus.BAD_GATEWAY,
  INVALID_OAUTH_STATE: HttpStatus.BAD_REQUEST,
  INVALID_MONEY_AMOUNT: HttpStatus.UNPROCESSABLE_ENTITY,
  INVOICE_TOTALS_MISMATCH: HttpStatus.UNPROCESSABLE_ENTITY,
  INVALID_INVOICE: HttpStatus.UNPROCESSABLE_ENTITY,
  NO_FILES_TO_IMPORT: HttpStatus.BAD_REQUEST,
  TOO_MANY_IMPORT_FILES: HttpStatus.BAD_REQUEST,
  IMPORT_FILE_NOT_PDF: HttpStatus.UNSUPPORTED_MEDIA_TYPE,
  IMPORT_FILE_TOO_LARGE: HttpStatus.PAYLOAD_TOO_LARGE,
  INVALID_SCHEDULE: HttpStatus.UNPROCESSABLE_ENTITY,
};

@Catch(DomainError)
export class DomainErrorFilter implements ExceptionFilter {
  catch(exception: DomainError, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = DOMAIN_ERROR_STATUS[exception.code] ?? HttpStatus.UNPROCESSABLE_ENTITY;

    response.status(status).json({
      statusCode: status,
      code: exception.code,
      message: exception.message,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
