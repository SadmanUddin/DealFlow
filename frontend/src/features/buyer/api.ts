import { z } from "zod";
import {
  deleteValidated,
  getValidated,
  paginationSchema,
  patchValidated,
  postValidated,
} from "@/features/workspace/api-core";

const money = z
  .string()
  .regex(/^\d{1,16}(\.\d{1,2})?$/)
  .nullable();
export const favoriteSchema = z.object({
  id: z.number().int().positive(),
  createdAt: z.string().or(z.date()),
  listingId: z.number().int().positive(),
  title: z.string(),
  description: z.string(),
  industry: z.string().nullable(),
  location: z.string().nullable(),
  askingPrice: money,
  currency: z.string().length(3),
  publishedAt: z.string().nullable(),
});
export type Favorite = z.infer<typeof favoriteSchema>;

const favoritesPageSchema = z.object({
  favorites: z.array(favoriteSchema),
  pagination: paginationSchema,
});
const favoriteAddSchema = z.object({
  favorite: z.object({ listingId: z.number().int().positive() }),
  created: z.boolean(),
});
const favoriteRemoveSchema = z.object({ removed: z.boolean() });

export const listFavorites = (page = 1, limit = 100) =>
  getValidated("/favorites", favoritesPageSchema, { page, limit });
export const addFavorite = (listingId: number) =>
  postValidated(`/favorites/${listingId}`, {}, favoriteAddSchema);
export const removeFavorite = (listingId: number) =>
  deleteValidated(`/favorites/${listingId}`, favoriteRemoveSchema);

const notificationSchema = z.object({
  id: z.number().int().positive(),
  type: z.string(),
  payload: z.record(z.string(), z.unknown()),
  readAt: z.string().nullable(),
  createdAt: z.string(),
});
export type DealFlowNotification = z.infer<typeof notificationSchema>;
const notificationPageSchema = z.object({
  notifications: z.array(notificationSchema),
  pagination: paginationSchema,
});
const notificationReadSchema = z.object({
  notification: z.object({
    id: z.number().int().positive(),
    readAt: z.string(),
  }),
});
const markAllSchema = z.object({
  updatedCount: z.number().int().nonnegative(),
});

export const listNotifications = (page = 1, limit = 50, unread?: boolean) =>
  getValidated("/notifications", notificationPageSchema, {
    page,
    limit,
    unread: unread === undefined ? undefined : String(unread),
  });
export const markNotificationRead = (id: number) =>
  patchValidated(`/notifications/${id}/read`, {}, notificationReadSchema);
export const markAllNotificationsRead = () =>
  patchValidated("/notifications/read", {}, markAllSchema);
