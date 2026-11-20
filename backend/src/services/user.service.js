import { eq } from 'drizzle-orm';
import { db } from '#config/database.js';
import { users } from '#models/user.model.js';
import { AppError } from '#utils/app-error.js';

const publicUserFields = {
  id: users.id,
  name: users.name,
  email: users.email,
  role: users.role,
  emailVerified: users.email_verified,
  isActive: users.is_active,
  createdAt: users.created_at,
  updatedAt: users.updated_at,
};

export const getUserProfile = async userId => {
  const [user] = await db
    .select(publicUserFields)
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user || !user.isActive) {
    throw new AppError(404, 'USER_NOT_FOUND', 'User account was not found');
  }
  return user;
};

export const updateUserProfile = async (userId, updates) => {
  const [user] = await db
    .update(users)
    .set({ ...updates, updated_at: new Date() })
    .where(eq(users.id, userId))
    .returning(publicUserFields);
  if (!user || !user.isActive) {
    throw new AppError(404, 'USER_NOT_FOUND', 'User account was not found');
  }
  return user;
};
