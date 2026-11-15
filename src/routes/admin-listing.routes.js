import express from 'express';
import {
  getAdminListings,
  moderateListing,
} from '#controllers/admin-listing.controller.js';
import {
  authorizeRoles,
  requireAuthentication,
  requireCsrf,
} from '#middleware/auth.middleware.js';

const router = express.Router();
router.use(requireAuthentication, authorizeRoles('admin'));
router.get('/', getAdminListings);
router.patch('/:id/moderation', requireCsrf, moderateListing);

export default router;
