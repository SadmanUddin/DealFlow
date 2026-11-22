import app from './app.js';
import { getEnvironment } from '#config/env.js';
import logger from '#config/logger.js';

const { PORT } = getEnvironment();
const server = app.listen(PORT, () => {
  logger.info('DealFlow API listening', { port: PORT });
});
server.headersTimeout = 30_000;
server.requestTimeout = 120_000;
server.keepAliveTimeout = 5_000;

let stopping = false;
const shutdown = signal => {
  if (stopping) return;
  stopping = true;
  logger.info('API shutdown requested', { signal });
  const deadline = setTimeout(() => server.closeAllConnections(), 15_000);
  deadline.unref();
  server.close(error => {
    clearTimeout(deadline);
    if (error) {
      logger.error('API shutdown failed');
      process.exitCode = 1;
    }
  });
};
process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
