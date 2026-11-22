import { setTimeout as sleep } from 'node:timers/promises';
import { getEnvironment } from '#config/env.js';
import logger from '#config/logger.js';
import { processOutboxBatch } from '#services/outbox.service.js';

const environment = getEnvironment();
const shutdown = new globalThis.AbortController();
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    shutdown.abort();
    logger.info('Outbox worker shutdown requested', { signal });
  });
}

logger.info('Outbox worker started');
let lastPulse = Date.now();
while (!shutdown.signal.aborted) {
  let processed = 0;
  try {
    processed = await processOutboxBatch(environment.OUTBOX_BATCH_SIZE);
    if (Date.now() - lastPulse >= 60_000) {
      logger.info('Outbox worker healthy', { lastBatchSize: processed });
      lastPulse = Date.now();
    }
  } catch {
    logger.error('Outbox worker batch failed');
  }
  if (!processed && !shutdown.signal.aborted) {
    await sleep(environment.OUTBOX_POLL_INTERVAL_MS, undefined, {
      signal: shutdown.signal,
    }).catch(error => {
      if (error.name !== 'AbortError') throw error;
    });
  }
}
logger.info('Outbox worker stopped');
