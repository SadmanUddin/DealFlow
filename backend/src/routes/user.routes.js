import express from 'express';
import {
  deactivateAccount,
  getProfile,
  patchProfile,
} from '#controllers/user.controller.js';
import {
  requireAuthentication,
  requireCsrf,
} from '#middleware/auth.middleware.js';

const router = express.Router();
router.use(requireAuthentication);
router.get('/profile', getProfile);
router.patch('/profile', requireCsrf, patchProfile);
router.patch('/deactivate', requireCsrf, deactivateAccount);

export default router;
