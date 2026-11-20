import express from 'express';
import {
  addFavorite,
  listFavorites,
  removeFavorite,
} from '#controllers/favorite.controller.js';
import {
  authorizeRoles,
  requireAuthentication,
  requireCsrf,
} from '#middleware/auth.middleware.js';

const router = express.Router();
router.use(requireAuthentication, authorizeRoles('buyer'));
router.get('/', listFavorites);
router.post('/:listingId', requireCsrf, addFavorite);
router.delete('/:listingId', requireCsrf, removeFavorite);
export default router;
