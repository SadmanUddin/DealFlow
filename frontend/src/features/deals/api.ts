import { z } from "zod";
import { apiClient } from "@/lib/api-client";
import {
  getValidated,
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
  event_type: z.string(),
  metadata: z.record(z.string(), z.unknown()),
  created_at: dateValue,
});
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
