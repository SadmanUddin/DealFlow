import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '#config/database.js';
import { notificationEmailPreferences, notifications } from '#models/phase6.model.js';
import { AppError } from '#utils/app-error.js';

export const listNotifications = async (userId, { page, limit, unread }) => {
  const filters = [eq(notifications.user_id, userId)];
  if (unread === 'true') filters.push(isNull(notifications.read_at));
  if (unread === 'false') filters.push(sql`${notifications.read_at} IS NOT NULL`);
  const where = and(...filters);
  const [rows, counts] = await Promise.all([
    db.select({ id: notifications.id, type: notifications.type, payload: notifications.payload, readAt: notifications.read_at, createdAt: notifications.created_at }).from(notifications).where(where).orderBy(desc(notifications.created_at), desc(notifications.id)).limit(limit).offset((page - 1) * limit),
    db.select({ count: sql`count(*)::int` }).from(notifications).where(where),
  ]);
  const total = counts[0]?.count ?? 0;
  return { notifications: rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};

export const markNotificationRead = async (userId, id) => {
  const [row] = await db.update(notifications).set({ read_at: new Date() }).where(and(eq(notifications.id, id), eq(notifications.user_id, userId))).returning({ id: notifications.id, readAt: notifications.read_at });
  if (!row) throw new AppError(404, 'NOTIFICATION_NOT_FOUND', 'Notification was not found');
  return row;
};

export const markAllNotificationsRead = async userId => {
  const rows = await db.update(notifications).set({ read_at: new Date() }).where(and(eq(notifications.user_id, userId), isNull(notifications.read_at))).returning({ id: notifications.id });
  return { updatedCount: rows.length };
};

export const deleteNotification = async (userId, id) => {
  const [row] = await db.delete(notifications).where(and(eq(notifications.id, id), eq(notifications.user_id, userId))).returning({ id: notifications.id });
  if (!row) throw new AppError(404, 'NOTIFICATION_NOT_FOUND', 'Notification was not found');
  return { deleted: true };
};

const defaults = { listingStatus: true, listingPrice: true, listingDetails: true };
const fields = { user_id: notificationEmailPreferences.user_id, listingStatus: notificationEmailPreferences.listing_status, listingPrice: notificationEmailPreferences.listing_price, listingDetails: notificationEmailPreferences.listing_details, updatedAt: notificationEmailPreferences.updated_at };
export const getEmailPreferences = async userId => {
  const [preferences] = await db.select(fields).from(notificationEmailPreferences).where(eq(notificationEmailPreferences.user_id, userId)).limit(1);
  return { preferences: preferences ?? defaults };
};
export const updateEmailPreferences = async (userId, input) => {
  const values = {
    user_id: userId,
    ...(input.listingStatus === undefined ? {} : { listing_status: input.listingStatus }),
    ...(input.listingPrice === undefined ? {} : { listing_price: input.listingPrice }),
    ...(input.listingDetails === undefined ? {} : { listing_details: input.listingDetails }),
  };
  const updates = {
    ...(input.listingStatus === undefined ? {} : { listing_status: input.listingStatus }),
    ...(input.listingPrice === undefined ? {} : { listing_price: input.listingPrice }),
    ...(input.listingDetails === undefined ? {} : { listing_details: input.listingDetails }),
    updated_at: new Date(),
  };
  const [preferences] = await db.insert(notificationEmailPreferences).values(values).onConflictDoUpdate({ target: notificationEmailPreferences.user_id, set: updates }).returning(fields);
  return { preferences };
};
