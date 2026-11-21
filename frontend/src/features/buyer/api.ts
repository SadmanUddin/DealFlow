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
  sellerName: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
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
export const deleteNotification = (id: number) =>
  deleteValidated(`/notifications/${id}`, z.object({ deleted: z.boolean() }));

const conversationSchema = z.object({
  id: z.number().int().positive(),
  listingId: z.number().int().positive(),
  listingTitle: z.string(),
  buyerId: z.number().int().positive(),
  sellerId: z.number().int().positive(),
  participantName: z.string().nullable(),
  status: z.enum(["pending", "in_review", "accepted", "rejected", "closed"]),
  statusUpdatedAt: z.string().or(z.date()),
  createdAt: z.string().or(z.date()),
  latestMessage: z.string().nullable(),
  latestMessageAt: z.string().or(z.date()).nullable(),
  unreadCount: z.number().int().nonnegative(),
});
export type BuyerConversation = z.infer<typeof conversationSchema>;
const conversationPageSchema = z.object({
  conversations: z.array(conversationSchema),
  pagination: paginationSchema,
});
export const listBuyerConversations = (page = 1, limit = 100) =>
  getValidated("/conversations", conversationPageSchema, { page, limit });
export const startListingConversation = (listingId: number) =>
  postValidated(
    "/conversations",
    { listingId },
    z.object({ conversation: z.object({ id: z.number().int().positive() }) }),
  );
const conversationMessageSchema = z.object({
  id: z.number().int().positive(),
  conversationId: z.number().int().positive(),
  senderId: z.number().int().positive(),
  senderName: z.string().nullable().optional(),
  content: z.string(),
  createdAt: z.string().or(z.date()),
  readAt: z.string().or(z.date()).nullable(),
});
const conversationMessagesSchema = z.object({
  messages: z.array(conversationMessageSchema),
  pagination: z.object({
    limit: z.number().int().positive(),
    hasMore: z.boolean(),
    nextCursor: z.string().nullable(),
  }),
});
export const listBuyerConversationMessages = (
  id: number,
  limit = 50,
  cursor?: string,
) =>
  getValidated(`/conversations/${id}/messages`, conversationMessagesSchema, {
    limit,
    cursor,
  });
export const sendBuyerConversationMessage = (id: number, content: string) =>
  postValidated(
    `/conversations/${id}/messages`,
    { content },
    z.object({ message: conversationMessageSchema }),
  );
export const markBuyerConversationRead = (id: number) =>
  patchValidated(
    `/conversations/${id}/read`,
    {},
    z.object({ conversationId: z.number(), readCount: z.number() }),
  );
// These endpoints are participant-scoped and serve both buyer and seller inboxes.
export const listConversations = listBuyerConversations;
export const listConversationMessages = listBuyerConversationMessages;
export const sendConversationMessage = sendBuyerConversationMessage;
export const markConversationRead = markBuyerConversationRead;
