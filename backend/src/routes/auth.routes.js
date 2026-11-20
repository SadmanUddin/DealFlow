import express from 'express';
import {
  forgotPassword,
  getCsrfToken,
  getCurrentUser,
  resetPasswordWithToken,
  signIn,
  signOut,
  signup,
  verifyEmailAddress,
} from '#controllers/auth.controller.js';
import {
  requireAuthentication,
  requireCsrf,
} from '#middleware/auth.middleware.js';

const router = express.Router();
router.post('/sign-up', signup);
router.post('/sign-in', signIn);
router.post('/sign-out', requireCsrf, signOut);
router.get('/me', requireAuthentication, getCurrentUser);
router.get('/csrf', requireAuthentication, getCsrfToken);
router.post('/verify-email', verifyEmailAddress);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPasswordWithToken);

export default router;
