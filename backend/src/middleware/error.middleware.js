import { ZodError } from 'zod';
import logger from '#config/logger.js';
import { AppError } from '#utils/app-error.js';

export const notFoundMiddleware = (req, res, next) => {
  next(new AppError(404, 'NOT_FOUND', 'The requested endpoint was not found'));
};

export const errorMiddleware = (error, req, res, next) => {
  if (res.headersSent) return next(error);

  let status = 500;
  let code = 'INTERNAL_SERVER_ERROR';
  let message = 'An unexpected error occurred';
  let details;

  if (error instanceof AppError) {
    status = error.status;
    code = error.code;
    message = error.message;
    details = error.details;
  } else if (error instanceof ZodError) {
    status = 400;
    code = 'VALIDATION_ERROR';
    message = 'Request validation failed';
    details = error.issues.map(issue => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
  } else if (error?.code === '23505') {
    status = 409;
    code = 'CONFLICT';
    message = 'A record with the supplied unique value already exists';
  } else if (error?.type === 'entity.parse.failed') {
    status = 400;
    code = 'INVALID_JSON';
    message = 'Request body must contain valid JSON';
  } else if (error?.type === 'entity.too.large') {
    status = 413;
    code = 'PAYLOAD_TOO_LARGE';
    message = 'Request body is too large';
  }

  if (status >= 500) {
    const databaseError = error?.cause?.cause ?? error?.cause ?? error;
    logger.error('Unhandled API error', {
      requestId: req.requestId,
      error: error?.message,
      database: {
        code: databaseError?.code,
        severity: databaseError?.severity,
        constraint: databaseError?.constraint,
        routine: databaseError?.routine,
        detail: databaseError?.detail,
        message: databaseError?.message,
      },
      stack: error?.stack,
      method: req.method,
      path: req.path,
    });
  }

  res.status(status).json({
    error: {
      code,
      message,
      ...(details ? { details } : {}),
    },
  });
};
