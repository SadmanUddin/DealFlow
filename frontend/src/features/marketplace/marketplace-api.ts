import { z } from "zod";
import { ApiError } from "@/lib/api-error";
import { apiClient } from "@/lib/api-client";

const moneySchema = z
  .union([
    z.string().regex(/^\d{1,16}(\.\d{1,2})?$/),
    z.number().finite().nonnegative(),
  ])
  .nullable();

export const publicListingSchema = z.object({
  id: z.number().int().positive().safe(),
  title: z.string(),
  description: z.string(),
  industry: z.string().nullable(),
  location: z.string().nullable(),
  askingPrice: moneySchema,
  annualRevenue: moneySchema,
  ebitda: moneySchema,
  currency: z.string().length(3),
  publishedAt: z.string().nullable(),
  createdAt: z.string(),
});

export type PublicListing = z.infer<typeof publicListingSchema>;

const paginationSchema = z.object({
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

const listingPageSchema = z.object({
  listings: z.array(publicListingSchema),
  pagination: paginationSchema,
});

const listingResponseSchema = z.object({ listing: publicListingSchema });

export type MarketplaceFilters = {
  page: number;
  limit: number;
  q?: string;
  industry?: string;
  location?: string;
  sort: "newest" | "oldest" | "price_asc" | "price_desc";
};

const validPage = (value: string | null, fallback: number) => {
  if (!value || !/^\d+$/.test(value)) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
};
const optionalText = (value: string | null, maximum: number) => {
  const normalized = value?.trim().slice(0, maximum);
  return normalized || undefined;
};
/** Read only supported, valid backend filters from a location search string. */
export function parseMarketplaceFilters(search: string): MarketplaceFilters {
  const params = new URLSearchParams(search);
  const filters: MarketplaceFilters = {
    page: validPage(params.get("page"), 1),
    limit: Math.min(100, validPage(params.get("limit"), 12)),
    sort: ["newest", "oldest", "price_asc", "price_desc"].includes(
      params.get("sort") ?? "",
    )
      ? (params.get("sort") as MarketplaceFilters["sort"])
      : "newest",
    q: optionalText(params.get("q"), 200),
    industry: optionalText(params.get("industry"), 120),
    location: optionalText(params.get("location"), 160),
  };
  return filters;
}

export function serializeMarketplaceFilters(filters: MarketplaceFilters) {
  const params = new URLSearchParams();
  for (const key of ["q", "industry", "location"] as const) {
    const value = filters[key];
    if (value) params.set(key, value);
  }
  if (filters.sort !== "newest") params.set("sort", filters.sort);
  if (filters.page > 1) params.set("page", String(filters.page));
  if (filters.limit !== 12) params.set("limit", String(filters.limit));
  return params;
}

function parseApiResponse<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ApiError("The marketplace returned an unexpected response.", {
      status: 502,
      code: "INVALID_API_RESPONSE",
    });
  }
  return result.data;
}

export async function getPublicListings(filters: MarketplaceFilters) {
  const { data } = await apiClient.get<unknown>("/listings", {
    params: filters,
  });
  return parseApiResponse(listingPageSchema, data);
}

export async function getPublishedListing(id: number) {
  const { data } = await apiClient.get<unknown>(`/listings/${id}`);
  return parseApiResponse(listingResponseSchema, data).listing;
}
