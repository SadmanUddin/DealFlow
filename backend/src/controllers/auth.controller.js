import { getEnvironment } from '#config/env.js';
import {
  authenticateUser,
  createSession,
  csrfTokenForSession,
  registerUser,
  requestEmailVerification,
  queueEmailVerification,
  requestPasswordReset,
  resetPassword,
  revokeSession,
  verifyEmail,
} from '#services/auth.service.js';
import { cookies } from '#utils/cookies.js';
import {
  forgotPasswordSchema,
  resetPasswordSchema,
  signInSchema,
  signupSchema,
  tokenSchema,
} from '#validations/auth.validation.js';

const startSession = async (user, res) => {
  const session = await createSession(user);
  cookies.setSession(res, session.accessToken);
  return session;
};

export const signup = async (req, res) => {
  const input = signupSchema.parse(req.body);
  const user = await registerUser(input);
  if (user) await queueEmailVerification(user);
  res.status(202).json({
    message:
      'If registration can be completed, a verification email will be sent.',
    email: input.email,
  });
};

export const signIn = async (req, res) => {
  const input = signInSchema.parse(req.body);
  const user = await authenticateUser(input);
  const session = await startSession(user, res);
  res.status(200).json({ user, csrfToken: session.csrfToken });
};

export const signOut = async (req, res) => {
  if (req.user && req.authSession) await revokeSession(req.authSession.id);
  cookies.clearSession(res);
  res.status(200).json({ message: 'Signed out' });
};

export const getCurrentUser = (req, res) => {
  res.status(200).json({ user: req.user });
};

export const getCsrfToken = (req, res) => {
  res.status(200).json({ csrfToken: csrfTokenForSession(req.authSession.id) });
};

export const verifyEmailAddress = async (req, res) => {
  const { token } = tokenSchema.parse(req.body);
  await verifyEmail(token);
  res.status(200).json({ message: 'Email verified' });
};

export const resendEmailVerification = async (req, res) => {
  const { email } = forgotPasswordSchema.parse(req.body);
  await requestEmailVerification(email);
  res.status(200).json({
    message:
      'If an unverified account exists for this email, a verification email will be sent.',
  });
};

export const forgotPassword = async (req, res) => {
  const { email } = forgotPasswordSchema.parse(req.body);
  const tokenResult = await requestPasswordReset(email);
  const { NODE_ENV } = getEnvironment();
  res.status(200).json({
    message: 'Password reset request received.',
    ...(NODE_ENV === 'test'
      ? { resetToken: tokenResult.token ?? tokenResult.decoyToken }
      : {}),
  });
};

export const resetPasswordWithToken = async (req, res) => {
  const input = resetPasswordSchema.parse(req.body);
  await resetPassword(input.token, input.password);
  res.status(200).json({ message: 'Password reset successfully' });
};
