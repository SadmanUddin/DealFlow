import express from 'express';
import logger from '#config/logger.js';
import helmet from 'helmet';
import morgan from 'morgan';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/auth.routes.js';
import securityMiddleware from '#middleware/security.middleware.js';
import privateCacheMiddleware from '#middleware/private-cache.middleware.js';
import userRoutes from './routes/user.routes.js';
import sellerAnalyticsRoutes from './routes/seller-analytics.routes.js';
import listingRoutes from './routes/listing.routes.js';
import adminListingRoutes from './routes/admin-listing.routes.js';
import conversationRoutes from './routes/conversation.routes.js';
import documentRoutes from './routes/document.routes.js';
import savedSearchRoutes from './routes/saved-search.routes.js';
import favoriteRoutes from './routes/favorite.routes.js';
import notificationRoutes from './routes/notification.routes.js';
import adminRoutes from './routes/admin.routes.js';
import reportRoutes from './routes/report.routes.js';
import dealRoutes from './routes/deal.routes.js';
import { randomUUID } from 'node:crypto';
import { optionalAuthentication } from '#middleware/auth.middleware.js';
import {
  errorMiddleware,
  notFoundMiddleware,
} from '#middleware/error.middleware.js';
import { checkDatabase } from '#config/database.js';
import { getEnvironment } from '#config/env.js';
import { AppError } from '#utils/app-error.js';

const app = express();
const allowedOrigins = getEnvironment()
  .CORS_ORIGINS.split(',')
  .map(origin => origin.trim())
  .filter(Boolean);
const trustedProxies = getEnvironment()
  .ARCJET_TRUSTED_PROXIES.split(',')
  .map(proxy => proxy.trim())
  .filter(Boolean);

// Only trust forwarding headers from explicitly configured proxy addresses.
// The default is a direct connection; arbitrary X-Forwarded-For values are ignored.
app.set('trust proxy', trustedProxies.length ? trustedProxies : false);

app.use((req, res, next) => {
  const candidate = req.get('x-request-id');
  req.requestId =
    candidate &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      candidate
    )
      ? candidate
      : randomUUID();
  res.set('X-Request-Id', req.requestId);
  next();
});
app.use(
  morgan((tokens, req, res) => {
    const durationMs = Number(tokens['total-time'](req, res)) || undefined;
    const template = req.route?.path;
    const route =
      typeof template === 'string'
        ? (
          req.baseUrl.replace(
            /^(\/api\/conversations)\/[^/]+(\/documents)$/i,
            '$1/:conversationId$2'
          ) + template
        ).replace(/\/$/, '') || '/'
        : 'unmatched';
    logger[durationMs >= 1000 ? 'warn' : 'info']('HTTP request completed', {
      requestId: req.requestId,
      method: req.method,
      status: Number(tokens.status(req, res)) || undefined,
      route,
      durationMs,
    });
    return undefined;
  })
);

app.use(helmet());
app.use(
  cors({
    credentials: true,
    exposedHeaders: [
      'Retry-After',
      'RateLimit',
      'RateLimit-Policy',
      'X-Request-Id',
    ],
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin))
        return callback(null, true);
      return callback(
        new AppError(403, 'CORS_ORIGIN_DENIED', 'Origin is not allowed')
      );
    },
  })
);
app.use(express.json({ limit: '32kb' }));
app.use(express.urlencoded({ extended: true, limit: '32kb' }));
app.use(cookieParser());

app.get('/', (req, res) => {
  logger.info('Hello from DealFlow');
  res.status(200).send('Hello from DealFLow!');
});
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});
app.get('/ready', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    await checkDatabase();
    res.status(200).json({ status: 'ready' });
  } catch {
    logger.warn('Database readiness check failed', {
      requestId: req.requestId,
    });
    res.status(503).json({ status: 'unavailable' });
  }
});
app.use(optionalAuthentication);
app.use(privateCacheMiddleware);
app.use(securityMiddleware);
app.get('/api', (req, res) => {
  res.status(200).json({
    message: 'DealFLow api is running!',
  });
});
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/listings', listingRoutes);
app.use('/api/seller/analytics', sellerAnalyticsRoutes);
app.use('/api/admin/listings', adminListingRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/deals', dealRoutes);
app.use('/api/saved-searches', savedSearchRoutes);
app.use('/api/favorites', favoriteRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/conversations/:conversationId/documents', documentRoutes);
app.use(notFoundMiddleware);
app.use(errorMiddleware);

export default app;
