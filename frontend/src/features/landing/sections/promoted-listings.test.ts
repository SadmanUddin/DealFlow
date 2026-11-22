import { expect, it } from "vitest";
import type { PublicListing } from "@/features/marketplace/marketplace-api";
import { selectPromotedListings } from "./promoted-listings";

const listing = {
  status: "sold",
  soldAt: "2026-01-01",
  id: 9,
  title: "Local distribution company",
  currency: "EUR",
  description: "",
  industry: null,
  location: null,
  askingPrice: null,
  annualRevenue: null,
  ebitda: null,
  publishedAt: null,
  createdAt: "2025-01-01",
} satisfies PublicListing;

it("omits QA and unconfirmed records from Recently Sold and preserves real published records for Featured", () => {
  const qa = {
    ...listing,
    id: 2,
    title: "DealFlow QA Coffee Roaster 20261122",
  };
  const unavailable = { ...listing, id: 3, soldAt: null };
  const published = {
    ...listing,
    id: 4,
    status: "published" as const,
    soldAt: null,
  };
  expect(
    selectPromotedListings([qa, unavailable, published, listing], true),
  ).toEqual([listing]);
  expect(
    selectPromotedListings(
      [listing, { ...qa, status: "published" }, published],
      false,
    ),
  ).toEqual([published]);
});
