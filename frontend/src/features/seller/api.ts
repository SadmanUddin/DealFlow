import { z } from "zod";
import {
  deleteValidated,
  getValidated,
  paginationSchema,
  patchValidated,
  postValidated,
} from "@/features/workspace/api-core";
import { apiClient } from "@/lib/api-client";

const dateValue = z.string().or(z.date());
export const sellerListingSchema = z.object({
  id: z.number().int().positive(),
  title: z.string(),
  description: z.string(),
  industry: z.string().nullable(),
  location: z.string().nullable(),
  askingPrice: z.string().nullable(),
  annualRevenue: z.string().nullable(),
  ebitda: z.string().nullable(),
  currency: z.string().length(3),
  publishedAt: dateValue.nullable(),
  createdAt: dateValue,
  status: z.enum(["draft", "pending", "published", "rejected", "archived"]),
  rejectionReason: z.string().nullable(),
  updatedAt: dateValue,
});
export type SellerListing = z.infer<typeof sellerListingSchema>;
const listingPage = z.object({
  listings: z.array(sellerListingSchema),
  pagination: paginationSchema,
});
const listingResponse = z.object({ listing: sellerListingSchema });
const deletedResponse = z.object({ message: z.string() });

export type ListingInput = {
  title: string;
  description: string;
  industry: string | null;
  location: string | null;
  asking_price: string | null;
  annual_revenue: string | null;
  ebitda: string | null;
  currency: string;
};

export const listMyListings = (page = 1, limit = 100) =>
  getValidated("/listings/mine", listingPage, { page, limit });
export const createListing = (input: ListingInput) =>
  postValidated("/listings", input, listingResponse);
export const updateListing = (id: number, input: Partial<ListingInput>) =>
  patchValidated(`/listings/${id}`, input, listingResponse);
export const submitListing = (id: number) =>
  postValidated(`/listings/${id}/submit`, {}, listingResponse);
export const archiveListing = (id: number) =>
  postValidated(`/listings/${id}/archive`, {}, listingResponse);
export const deleteDraftListing = (id: number) =>
  deleteValidated(`/listings/${id}`, deletedResponse);

const inquirySchema = z.object({
  id: z.number().int().positive(),
  listingId: z.number().int().positive(),
  listingTitle: z.string(),
  status: z.enum(["pending", "in_review", "accepted", "rejected", "closed"]),
  statusUpdatedAt: dateValue,
  createdAt: dateValue,
});
export type Inquiry = z.infer<typeof inquirySchema>;
const inquiryPage = z.object({
  conversations: z.array(inquirySchema),
  pagination: paginationSchema,
});
const inquiryUpdate = z.object({
  inquiry: z.object({
    id: z.number().int().positive(),
    listingId: z.number().int().positive(),
    status: inquirySchema.shape.status,
    statusUpdatedAt: dateValue,
  }),
});
export const listInquiries = (page = 1, limit = 20) =>
  getValidated("/conversations", inquiryPage, { page, limit });
export const updateInquiryStatus = (id: number, status: Inquiry["status"]) =>
  patchValidated(`/conversations/${id}/status`, { status }, inquiryUpdate);

const messageSchema = z.object({
  id: z.number().int().positive(),
  conversationId: z.number().int().positive(),
  senderId: z.number().int().positive(),
  content: z.string(),
  createdAt: dateValue,
  readAt: dateValue.nullable(),
});
const messagePage = z.object({
  messages: z.array(messageSchema),
  pagination: z.object({
    limit: z.number(),
    hasMore: z.boolean(),
    nextCursor: z.string().nullable(),
  }),
});
export type InquiryMessage = z.infer<typeof messageSchema>;
export const listInquiryMessages = (id: number, limit = 50, cursor?: string) =>
  getValidated(`/conversations/${id}/messages`, messagePage, { limit, cursor });
export const sendInquiryMessage = (id: number, content: string) =>
  postValidated(
    `/conversations/${id}/messages`,
    { content },
    z.object({ message: messageSchema }),
  );
export const markInquiryRead = (id: number) =>
  patchValidated(
    `/conversations/${id}/read`,
    {},
    z.object({ conversationId: z.number(), readCount: z.number() }),
  );

const documentSchema = z.object({
  id: z.number().int().positive(),
  originalFilename: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  uploaderId: z.number().int().positive(),
  createdAt: dateValue,
});
const documentPage = z.object({
  documents: z.array(documentSchema),
  pagination: paginationSchema,
});
export type ConversationDocument = z.infer<typeof documentSchema>;
export const listInquiryDocuments = (conversationId: number) =>
  getValidated(`/conversations/${conversationId}/documents`, documentPage, {
    page: 1,
    limit: 100,
  });
export async function uploadInquiryDocument(
  conversationId: number,
  file: File,
) {
  const data = new FormData();
  data.append("file", file);
  const response = await apiClient.post(
    `/conversations/${conversationId}/documents`,
    data,
  );
  return z.object({ document: documentSchema }).parse(response.data).document;
}
export async function downloadInquiryDocument(
  conversationId: number,
  documentId: number,
) {
  const response = await apiClient.get(
    `/conversations/${conversationId}/documents/${documentId}/download`,
    { responseType: "blob" },
  );
  return response.data as Blob;
}
export async function deleteInquiryDocument(
  conversationId: number,
  documentId: number,
) {
  await apiClient.delete(
    `/conversations/${conversationId}/documents/${documentId}`,
  );
  return true;
}
