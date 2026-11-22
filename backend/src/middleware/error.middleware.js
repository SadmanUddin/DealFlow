import { ZodError } from 'zod';
import logger from '#config/logger.js';
import { AppError } from '#utils/app-error.js';

export const notFoundMiddleware = (req, res, next) => {
  next(new AppError(404, 'NOT_FOUND', 'The requested endpoint was not found'));
};

export const errorMiddleware = (error, req, res, _next) => {
  if (res.headersSent) {
    logger.warn('Response stream interrupted', { requestId: req.requestId });
    res.destroy();
    return;
  }

  let status = 500;
  let code = 'INTERNAL_SERVER_ERROR';
  let message = 'An unexpected error occurred';
  let details;

  if (error instanceof AppError) {
    status = error.status;
    code = error.code;
    message = error.message;
    details = status < 500 ? error.details : undefined;
    if (status >= 500) message = 'The request could not be completed';
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
      code,
      status,
      sqlState:
        typeof databaseError?.code === 'string' &&
        /^[0-9A-Z]{5}$/.test(databaseError.code)
          ? databaseError.code
          : undefined,
      method: req.method,
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
