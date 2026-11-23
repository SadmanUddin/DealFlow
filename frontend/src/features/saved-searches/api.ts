import { z } from "zod";
import { apiClient } from "@/lib/api-client";
import {
  getValidated,
  paginationSchema,
  patchValidated,
  postValidated,
} from "@/features/workspace/api-core";

export const frequencies = ["instant", "daily", "weekly", "off"] as const;
const frequency = z.enum(frequencies);
const filtersSchema = z.object({
  availability: z.enum(["available", "sold", "all"]),
  sort: z.enum(["newest", "oldest", "price_asc", "price_desc"]),
  q: z.string().optional(),
  industry: z.string().optional(),
  location: z.string().optional(),
  minPrice: z.string().optional(),
  maxPrice: z.string().optional(),
  minRevenue: z.string().optional(),
  maxRevenue: z.string().optional(),
  minEbitda: z.string().optional(),
  maxEbitda: z.string().optional(),
});
const savedSearchSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  filters: filtersSchema,
  frequency,
  alertsEnabled: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type SavedSearch = z.infer<typeof savedSearchSchema>;
export type SavedFilters = z.infer<typeof filtersSchema>;
export type SavedSearchInput = Pick<
  SavedSearch,
  "name" | "filters" | "frequency" | "alertsEnabled"
> & { confirmEmpty?: boolean };
const response = z.object({ savedSearch: savedSearchSchema });
const base = "/saved-searches";
export const savedSearchKey = ["buyer", "saved-searches"] as const;
export const listSavedSearches = (page: number) =>
  getValidated(
    base,
    z.object({
      savedSearches: z.array(savedSearchSchema),
      pagination: paginationSchema,
    }),
    { page, limit: 20 },
  );
export const getSavedSearch = (id: number) =>
  getValidated(`${base}/${id}`, response).then((result) => result.savedSearch);
export const createSavedSearch = (input: SavedSearchInput) =>
  postValidated(base, input, response);
export const updateSavedSearch = (
  id: number,
  input: Partial<SavedSearchInput>,
) => patchValidated(`${base}/${id}`, input, response);
export const deleteSavedSearch = (id: number) =>
  apiClient.delete(`${base}/${id}`);
