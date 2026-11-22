import express from 'express';
import {
  forgotPassword,
  mfaStatus,
  mfaBegin,
  mfaActivate,
  mfaReplaceRecovery,
  mfaRemove,
  getCsrfToken,
  getCurrentUser,
  resetPasswordWithToken,
  resendEmailVerification,
  signIn,
  signOut,
  signup,
  verifyEmailAddress,
} from '#controllers/auth.controller.js';
import {
  requireAuthentication,
  requireAdmin,
  requireCsrf,
} from '#middleware/auth.middleware.js';

const router = express.Router();
router.post('/sign-up', signup);
router.post('/sign-in', signIn);
router.post('/sign-out', requireCsrf, signOut);
router.get('/me', requireAuthentication, getCurrentUser);
router.get('/csrf', requireAuthentication, getCsrfToken);
router.post('/verify-email', verifyEmailAddress);
router.post('/resend-verification', resendEmailVerification);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPasswordWithToken);

router.get('/admin-mfa', ...requireAdmin, mfaStatus);
router.post('/admin-mfa/enroll', ...requireAdmin, requireCsrf, mfaBegin);
router.post('/admin-mfa/activate', ...requireAdmin, requireCsrf, mfaActivate);
router.post(
  '/admin-mfa/recovery',
  ...requireAdmin,
  requireCsrf,
  mfaReplaceRecovery
);
router.post('/admin-mfa/remove', ...requireAdmin, requireCsrf, mfaRemove);

export default router;
