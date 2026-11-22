import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { ListingCard } from "@/features/marketplace/ListingCard";
import { getPublicListings } from "@/features/marketplace/marketplace-api";

export function RecentlySoldSection() {
  const query = useQuery({
    queryKey: ["marketplace", "recently-sold"],
    queryFn: () =>
      getPublicListings({
        page: 1,
        limit: 3,
        availability: "sold",
        sort: "newest",
      }),
    staleTime: 30_000,
  });
  const listings = query.data?.listings ?? [];
  if (!listings.length) return null;

  return (
    <section
      className="border-y border-line bg-emerald-50/40"
      aria-labelledby="recently-sold"
    >
      <div className="page-container py-12 sm:py-20">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <h2
            id="recently-sold"
            className="text-3xl font-semibold tracking-tight text-navy-950 sm:text-4xl"
          >
            Recently Sold Businesses
          </h2>
          <Button asChild variant="outline">
            <Link to="/marketplace?availability=sold">
              Explore Sold Businesses{" "}
              <ArrowUpRight size={16} aria-hidden="true" />
            </Link>
          </Button>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {listings.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      </div>
    </section>
  );
}
