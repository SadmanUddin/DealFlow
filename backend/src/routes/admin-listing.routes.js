import express from 'express';
import {
  adminListingQueue,
  moderateListing,
} from '#controllers/admin.controller.js';
import { requireAdmin, requireCsrf } from '#middleware/auth.middleware.js';

const router = express.Router();
router.use(...requireAdmin);
router.get('/', adminListingQueue);
router.patch('/:id/moderation', requireCsrf, moderateListing);

export default router;
