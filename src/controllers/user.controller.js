import { deactivateAccount as deactivateAccountService } from '#services/auth.service.js';
import { getUserProfile, updateUserProfile } from '#services/user.service.js';
import { cookies } from '#utils/cookies.js';
import {
  deactivateAccountSchema,
  profileUpdateSchema,
} from '#validations/auth.validation.js';

export const getProfile = async (req, res) => {
  const user = await getUserProfile(req.user.id);
  res.status(200).json({ user });
};

export const patchProfile = async (req, res) => {
  const updates = profileUpdateSchema.parse(req.body);
  const user = await updateUserProfile(req.user.id, updates);
  res.status(200).json({ user });
};

export const deactivateAccount = async (req, res) => {
  const { password } = deactivateAccountSchema.parse(req.body);
  await deactivateAccountService(req.user.id, password);
  cookies.clearSession(res);
  res.status(200).json({ message: 'Account deactivated' });
};
