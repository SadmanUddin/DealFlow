import { z } from "zod";
import { apiClient } from "@/lib/api-client";
import {
  getValidated,
  parseValidated,
  patchValidated,
  postValidated,
  paginationSchema,
} from "@/features/workspace/api-core";

const dateValue = z.string().or(z.date());
const dealStatus = z.enum([
  "proposed",
  "negotiating",
  "due_diligence",
  "accepted",
  "completed",
  "cancelled",
  "rejected",
]);

export const dealSchema = z.object({
  id: z.number().int().positive(),
  listing_id: z.number().int().positive(),
  buyer_id: z.number().int().positive(),
  seller_id: z.number().int().positive(),
  buyer_name: z.string().nullable().optional(),
  seller_name: z.string().nullable().optional(),
  listing_title: z.string().optional(),
  status: dealStatus,
  accepted_at: dateValue.nullable(),
  created_at: dateValue,
  updated_at: dateValue,
});
export type Deal = z.infer<typeof dealSchema>;

export const offerSchema = z.object({
  id: z.number().int().positive(),
  deal_id: z.number().int().positive(),
  parent_offer_id: z.number().int().positive().nullable(),
  created_by: z.number().int().positive(),
  created_by_name: z.string().nullable().optional(),
  amount: z.string().regex(/^\d{1,16}(\.\d{1,2})?$/),
  currency: z.string().length(3),
  message: z.string().nullable(),
  status: z.enum([
    "pending",
    "accepted",
    "rejected",
    "withdrawn",
    "superseded",
  ]),
  created_at: dateValue,
  responded_at: dateValue.nullable(),
});
export type Offer = z.infer<typeof offerSchema>;

const dealPageSchema = z.object({
  deals: z.array(dealSchema),
  pagination: paginationSchema,
});
const dealResponseSchema = z.object({ deal: dealSchema });
const dealCreateResponseSchema = z.object({
  deal: dealSchema,
  created: z.boolean(),
});
const offerPageSchema = z.object({
  offers: z.array(offerSchema),
  pagination: paginationSchema,
});
const offerResponseSchema = z.object({ offer: offerSchema });

export type CreateOfferInput = {
  amount: string;
  currency: string;
  message?: string;
  parentOfferId?: number;
};

export const listDeals = (page = 1, limit = 100) =>
  getValidated("/deals", dealPageSchema, { page, limit });

export const getDeal = (id: number) =>
  getValidated(`/deals/${id}`, dealResponseSchema).then(
    (result) => result.deal,
  );

export const createDeal = (listingId: number) =>
  postValidated("/deals", { listingId }, dealCreateResponseSchema);

export const listOffers = (dealId: number, page = 1, limit = 100) =>
  getValidated(`/deals/${dealId}/offers`, offerPageSchema, { page, limit });

export const createOffer = (dealId: number, input: CreateOfferInput) =>
  postValidated(`/deals/${dealId}/offers`, input, offerResponseSchema).then(
    (result) => result.offer,
  );

export const respondToOffer = (
  dealId: number,
  offerId: number,
  action: "accept" | "reject",
) =>
  postValidated(
    `/deals/${dealId}/offers/${offerId}/respond`,
    { action },
    offerResponseSchema,
  ).then((result) => result.offer);

export const withdrawOffer = (dealId: number, offerId: number) =>
  postValidated(
    `/deals/${dealId}/offers/${offerId}/withdraw`,
    {},
    offerResponseSchema,
  ).then((result) => result.offer);

export const updateDealStatus = (dealId: number, status: Deal["status"]) =>
  patchValidated(
    `/deals/${dealId}/status`,
    { status },
    dealResponseSchema,
  ).then((result) => result.deal);

const activitySchema = z.object({
  id: z.number().int().positive(),
  deal_id: z.number().int().positive(),
  actor_id: z.number().int().positive().nullable(),
  actor_name: z.string().nullable().optional(),
  event_type: z.string(),
  metadata: z.record(z.string(), z.unknown()),
  created_at: dateValue,
});
export type DealActivity = z.infer<typeof activitySchema>;
const historySchema = z.object({
  activities: z.array(activitySchema),
  pagination: paginationSchema,
});

export const listDealHistory = (dealId: number, page = 1, limit = 100) =>
  getValidated(`/deals/${dealId}/history`, historySchema, { page, limit });

const dealDocumentSchema = z.object({
  id: z.number().int().positive(),
  filename: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  createdAt: dateValue,
});
export type DealDocument = z.infer<typeof dealDocumentSchema>;
const documentListSchema = z.object({
  documents: z.array(dealDocumentSchema),
  pagination: paginationSchema,
});
const linkedDocumentSchema = z.object({ document: z.object({}).passthrough() });

export const listDealDocuments = (dealId: number, page = 1, limit = 100) =>
  getValidated(`/deals/${dealId}/documents`, documentListSchema, {
    page,
    limit,
  });

export const linkDealDocument = (
  dealId: number,
  conversationDocumentId: number,
) =>
  postValidated(
    `/deals/${dealId}/documents`,
    { conversationDocumentId },
    linkedDocumentSchema,
  );

export async function downloadDealDocument(dealId: number, documentId: number) {
  const response = await apiClient.get<Blob>(
    `/deals/${dealId}/documents/${documentId}/download`,
    { responseType: "blob" },
  );
  return response.data;
}

const conversationSchema = z.object({
  id: z.number().int().positive(),
  listingId: z.number().int().positive(),
  listingTitle: z.string(),
  buyerId: z.number().int().positive(),
  sellerId: z.number().int().positive(),
  participantName: z.string().nullable(),
  status: z.enum(["pending", "in_review", "accepted", "rejected", "closed"]),
  statusUpdatedAt: dateValue,
  createdAt: dateValue,
});
const conversationPageSchema = z.object({
  conversations: z.array(conversationSchema),
  pagination: paginationSchema,
});
export type DealConversation = z.infer<typeof conversationSchema>;
export const listDealConversations = (page = 1, limit = 100) =>
  getValidated("/conversations", conversationPageSchema, { page, limit });
export const getDealConversation = (dealId: number) =>
  getValidated(
    `/deals/${dealId}/conversation`,
    z.object({ conversation: conversationSchema.nullable() }),
  ).then((result) => result.conversation);
export const startDealConversation = (dealId: number) =>
  postValidated(
    `/deals/${dealId}/conversation`,
    {},
    z.object({ conversation: conversationSchema }),
  ).then((result) => result.conversation);

const conversationMessageSchema = z.object({
  id: z.number().int().positive(),
  conversationId: z.number().int().positive(),
  senderId: z.number().int().positive(),
  senderName: z.string().nullable(),
  content: z.string(),
  createdAt: dateValue,
  readAt: dateValue.nullable(),
});
const messagePageSchema = z.object({
  messages: z.array(conversationMessageSchema),
  pagination: z.object({
    limit: z.number().int().positive(),
    hasMore: z.boolean(),
    nextCursor: z.string().nullable(),
  }),
});
export type DealConversationMessage = z.infer<typeof conversationMessageSchema>;
export const listDealConversationMessages = (
  conversationId: number,
  cursor?: string,
) =>
  getValidated(`/conversations/${conversationId}/messages`, messagePageSchema, {
    limit: 50,
    cursor,
  });
export const sendDealConversationMessage = async (
  conversationId: number,
  content: string,
) => {
  const idempotencyKey = crypto.randomUUID();
  const { data } = await apiClient.post(
    `/conversations/${conversationId}/messages`,
    { content },
    { headers: { "Idempotency-Key": idempotencyKey } },
  );
  return parseValidated(
    z.object({ message: conversationMessageSchema }),
    data,
  );
};
export const markDealConversationRead = (conversationId: number) =>
  patchValidated(
    `/conversations/${conversationId}/read`,
    {},
    z.object({ conversationId: z.number(), readCount: z.number() }),
  );

const conversationDocumentSchema = z.object({
  id: z.number().int().positive(),
  originalFilename: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  uploaderId: z.number().int().positive(),
  createdAt: dateValue,
});
export type DealConversationDocument = z.infer<
  typeof conversationDocumentSchema
>;
export const listDealConversationDocuments = (conversationId: number) =>
  getValidated(
    `/conversations/${conversationId}/documents`,
    z.object({
      documents: z.array(conversationDocumentSchema),
      pagination: paginationSchema,
    }),
    { page: 1, limit: 100 },
  );
export async function uploadDealConversationDocument(
  conversationId: number,
  file: File,
) {
  const body = new FormData();
  body.append("file", file);
  const { data } = await apiClient.post<unknown>(
    `/conversations/${conversationId}/documents`,
    body,
  );
  return z.object({ document: conversationDocumentSchema }).parse(data)
    .document;
}
