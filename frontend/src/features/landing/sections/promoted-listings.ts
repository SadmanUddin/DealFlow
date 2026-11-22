import type { PublicListing } from "@/features/marketplace/marketplace-api";

export function selectPromotedListings(
  listings: PublicListing[],
  sold: boolean,
) {
  return listings
    .filter(
      (listing) =>
        // QA records use this title prefix. The public listing API has no promotion flag.
        !/^\s*DealFlow\s+QA\b/i.test(listing.title) &&
        (sold
          ? listing.status === "sold" && Boolean(listing.soldAt)
          : listing.status === "published"),
    )
    .slice(0, 3);
}
