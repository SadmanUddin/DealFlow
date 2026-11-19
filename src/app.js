import express from 'express';
import logger from '#config/logger.js';
import helmet from 'helmet';
import morgan from 'morgan';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/auth.routes.js';
import securityMiddleware from '#middleware/security.middleware.js';
import userRoutes from './routes/user.routes.js';
import listingRoutes from './routes/listing.routes.js';
import adminListingRoutes from './routes/admin-listing.routes.js';
import conversationRoutes from './routes/conversation.routes.js';
import documentRoutes from './routes/document.routes.js';
import favoriteRoutes from './routes/favorite.routes.js';
import notificationRoutes from './routes/notification.routes.js';
import adminRoutes from './routes/admin.routes.js';
import reportRoutes from './routes/report.routes.js';
import { randomUUID } from 'node:crypto';
import { optionalAuthentication } from '#middleware/auth.middleware.js';
import {
  errorMiddleware,
  notFoundMiddleware,
} from '#middleware/error.middleware.js';
import { getEnvironment } from '#config/env.js';
import { AppError } from '#utils/app-error.js';

const app = express();
const allowedOrigins = getEnvironment()
  .CORS_ORIGINS.split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

app.use(helmet());
app.use(
  cors({
    credentials: true,
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
app.use(express.urlencoded({ extended: true }));
app.use(
  morgan('combined', {
    stream: {
      write: message => logger.info(message.trim()),
    },
  })
);
app.use(cookieParser());
app.use((req, res, next) => {
  const candidate = req.get('x-request-id');
  req.requestId = candidate && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate) ? candidate : randomUUID();
  res.set('X-Request-Id', req.requestId);
  next();
});
app.use(optionalAuthentication);

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
app.get('/api', (req, res) => {
  res.status(200).json({
    message: 'DealFLow api is running!',
  });
});

app.use(securityMiddleware);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/listings', listingRoutes);
app.use('/api/admin/listings', adminListingRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/favorites', favoriteRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/conversations/:conversationId/documents', documentRoutes);
app.use(notFoundMiddleware);
app.use(errorMiddleware);

export default app;
