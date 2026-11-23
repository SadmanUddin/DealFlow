import {
  serializeMarketplaceFilters,
  type MarketplaceFilters,
} from "@/features/marketplace/marketplace-api";
import type { SavedFilters } from "./api";

const fields = [
  ["q", "Keyword"],
  ["industry", "Industry"],
  ["location", "Location"],
  ["minPrice", "Minimum price"],
  ["maxPrice", "Maximum price"],
  ["minRevenue", "Minimum annual revenue"],
  ["maxRevenue", "Maximum annual revenue"],
  ["minEbitda", "Minimum EBITDA"],
  ["maxEbitda", "Maximum EBITDA"],
] as const;

export function savedCriteria(filters: SavedFilters) {
  return fields.flatMap(([key, label]) =>
    filters[key] ? [{ label, value: filters[key] }] : [],
  );
}

export function fromMarketplace(criteria: MarketplaceFilters): SavedFilters {
  const filters: SavedFilters = {
    availability: criteria.availability ?? "available",
    sort: criteria.sort,
  };
  for (const [key] of fields) {
    const value = criteria[key];
    if (value !== undefined) filters[key] = value;
  }
  return filters;
}

export function savedSearchMarketplaceLink(
  filters: SavedFilters,
  edit?: number,
) {
  const params = serializeMarketplaceFilters({
    ...filters,
    page: 1,
    limit: 12,
  });
  if (edit !== undefined) params.set("editSavedSearch", String(edit));
  const search = params.toString();
  return { pathname: "/marketplace", search: search ? `?${search}` : "" };
}
