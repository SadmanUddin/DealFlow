import { getEnvironment } from '#config/env.js';
import logger from '#config/logger.js';
import { processOutboxBatch } from '#services/outbox.service.js';

const environment = getEnvironment();
let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stopping = true;
    logger.info('Outbox worker shutdown requested', { signal });
  });
}

while (!stopping) {
  try {
    const processed = await processOutboxBatch(environment.OUTBOX_BATCH_SIZE);
    if (!processed && !stopping)
      await new Promise(resolve =>
        setTimeout(resolve, environment.OUTBOX_POLL_INTERVAL_MS)
      );
  } catch (error) {
    logger.error('Outbox worker batch failed', { error: error.message });
    if (!stopping)
      await new Promise(resolve =>
        setTimeout(resolve, environment.OUTBOX_POLL_INTERVAL_MS)
      );
  }
}
logger.info('Outbox worker stopped');
