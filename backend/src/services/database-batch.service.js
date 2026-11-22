import { db } from '#config/database.js';
import logger from '#config/logger.js';
import { AppError } from '#utils/app-error.js';

export const executeDatabaseBatch = async operations => {
  try {
    return await db.batch(operations);
  } catch {
    logger.error('Database batch operation failed', {
      operationCount: operations.length,
    });
    throw new AppError(
      503,
      'DATABASE_BATCH_FAILED',
      'Database operations are temporarily unavailable'
    );
  }
};
