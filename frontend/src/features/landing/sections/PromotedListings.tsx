import { useQuery } from "@tanstack/react-query";
import { Building2 } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { ListingCard } from "@/features/marketplace/ListingCard";
import { ListingCardSkeleton } from "@/features/marketplace/ListingCardSkeleton";
import { getPublicListings } from "@/features/marketplace/marketplace-api";

import { selectPromotedListings } from "./promoted-listings";

export function PromotedListings({ sold = false }: { sold?: boolean }) {
  const availability = sold ? "sold" : "available";
  const query = useQuery({
    queryKey: ["marketplace", "promotion", availability],
    queryFn: () =>
      getPublicListings({ page: 1, limit: 12, availability, sort: "newest" }),
    staleTime: 30_000,
  });
  const listings = selectPromotedListings(query.data?.listings ?? [], sold);
  if (sold && !listings.length) return null;
  const id = sold ? "recently-sold" : "featured-businesses";
  return (
    <section
      className={
        sold
          ? "section-space border-y border-line bg-mist"
          : "section-space bg-ivory"
      }
      aria-labelledby={id}
    >
      <div className="page-container">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <h2 className="editorial-title text-4xl text-ink sm:text-6xl" id={id}>
            {sold ? "Recently Sold Businesses" : "Featured businesses"}
          </h2>
          <Button asChild variant="outline">
            <Link to={sold ? "/marketplace?availability=sold" : "/marketplace"}>
              {sold ? "Explore sold businesses" : "Browse the marketplace"}
            </Link>
          </Button>
        </div>
        {query.isPending ? (
          <div
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
            role="status"
            aria-label="Loading featured businesses"
          >
            {[1, 2, 3].map((index) => (
              <ListingCardSkeleton key={index} />
            ))}
          </div>
        ) : listings.length ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {listings.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        ) : (
          <div
            className="flex items-start gap-4 rounded-2xl border border-line bg-white p-5 sm:p-7"
            role="status"
          >
            <Building2
              className="mt-0.5 shrink-0 text-forest"
              aria-hidden="true"
              size={22}
            />
            <div>
              <p className="font-semibold">
                {query.isError
                  ? "Featured businesses are temporarily unavailable"
                  : "No featured businesses right now"}
              </p>
              <p className="mt-1 text-sm leading-6 text-ink-soft">
                {query.isError
                  ? "Open the marketplace or try loading this section again."
                  : "Check the marketplace for the latest available listings."}
              </p>
              {query.isError && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => void query.refetch()}
                >
                  Try again
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
