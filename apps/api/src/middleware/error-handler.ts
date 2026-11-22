import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { ApiFailure, ErrorCode } from '@grit/validation';
import { ZodError } from 'zod';
import { AppError } from '../shared/errors';

function failure(
  code: ErrorCode,
  message: string,
  details: unknown[],
  requestId?: string,
): ApiFailure {
  return { success: false, data: null, message, error: { code, details }, requestId };
}

/** Maps Postgres constraint errors raised by business rules to client errors. */
function fromPostgres(err: { code?: string; constraint?: string }): AppError | null {
  switch (err.code) {
    case '23505': // unique_violation
      return new AppError('CONFLICT', 'errors.conflict.duplicate', [
        { constraint: err.constraint },
      ]);
    case '23P01': // exclusion_violation (e.g. overlapping memberships)
      return new AppError('CONFLICT', 'errors.conflict.overlap', [{ constraint: err.constraint }]);
    case '23514': // check_violation
    case '23502': // not_null_violation
      return new AppError('VALIDATION_ERROR', 'errors.validation.failed', [
        { constraint: err.constraint },
      ]);
    case '23503': // foreign_key_violation
      return new AppError('CONFLICT', 'errors.conflict.reference', [
        { constraint: err.constraint },
      ]);
    default:
      return null;
  }
}

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json(failure('NOT_FOUND', 'errors.route.not_found', [], String(req.id ?? '')));
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const requestId = String(req.id ?? '');

  if (err instanceof ZodError) {
    const details = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    res
      .status(400)
      .json(failure('VALIDATION_ERROR', 'errors.validation.failed', details, requestId));
    return;
  }

  // Malformed JSON body from express.json()
  if (err?.type === 'entity.parse.failed') {
    res
      .status(400)
      .json(failure('VALIDATION_ERROR', 'errors.validation.malformed_json', [], requestId));
    return;
  }

  const appError = err instanceof AppError ? err : fromPostgres(err);
  if (appError) {
    res
      .status(appError.status)
      .json(failure(appError.code, appError.message, appError.details, requestId));
    return;
  }

  // Unexpected: log full error server-side, return no internals to the client.
  req.log?.error({ err }, 'unhandled error');
  res.status(500).json(failure('INTERNAL', 'errors.internal', [], requestId));
};
