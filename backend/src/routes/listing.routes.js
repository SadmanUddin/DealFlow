import express from 'express';
import {
  archiveListing,
  createListing,
  deleteListing,
  getMyListings,
  getPublicListings,
  getPublishedListing,
  submitListing,
  updateListing,
} from '#controllers/listing.controller.js';
import {
  authorizeRoles,
  requireAuthentication,
  requireCsrf,
} from '#middleware/auth.middleware.js';

const router = express.Router();
router.get('/', getPublicListings);
router.get(
  '/mine',
  requireAuthentication,
  authorizeRoles('seller'),
  getMyListings
);
router.post(
  '/',
  requireAuthentication,
  authorizeRoles('seller'),
  requireCsrf,
  createListing
);
router.get('/:id', getPublishedListing);
router.patch(
  '/:id',
  requireAuthentication,
  authorizeRoles('seller'),
  requireCsrf,
  updateListing
);
router.post(
  '/:id/submit',
  requireAuthentication,
  authorizeRoles('seller'),
  requireCsrf,
  submitListing
);
router.post(
  '/:id/archive',
  requireAuthentication,
  authorizeRoles('seller'),
  requireCsrf,
  archiveListing
);
router.delete(
  '/:id',
  requireAuthentication,
  authorizeRoles('seller'),
  requireCsrf,
  deleteListing
);

export default router;
