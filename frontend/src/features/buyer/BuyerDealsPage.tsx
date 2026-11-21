import { useMemo, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Building2, ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/shared/ErrorState";
import {
  SectionCard,
  StatusBadge,
  WorkspaceEmpty,
  WorkspacePageHeader,
  WorkspaceSkeleton,
} from "@/components/shared/workspace/WorkspaceUI";
import {
  getPublishedListing,
  type PublicListing,
} from "@/features/marketplace/marketplace-api";
import { formatListingMoney } from "@/features/marketplace/marketplace-format";
import { listDeals } from "@/features/deals/api";

function dateLabel(value: string | Date) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
    new Date(value),
  );
}

export function BuyerDealsPage() {
  const [page, setPage] = useState(1);
  const dealsQuery = useQuery({
    queryKey: ["deals", "mine", page, 10],
    queryFn: () => listDeals(page, 10),
    staleTime: 15_000,
  });
  const deals = useMemo(
    () => dealsQuery.data?.deals ?? [],
    [dealsQuery.data?.deals],
  );
  const listings = useQueries({
    queries: deals.map((deal) => ({
      queryKey: ["marketplace", "listing", deal.listing_id],
      queryFn: () => getPublishedListing(deal.listing_id),
      staleTime: 30_000,
      retry: false,
    })),
  });
  const byDeal = useMemo(
    () =>
      new Map(
        deals.map((deal, index) => [
          deal.id,
          listings[index]?.data as PublicListing | undefined,
        ]),
      ),
    [deals, listings],
  );

  return (
    <>
      <WorkspacePageHeader
        description="Every acquisition started by or shared with your buyer account, ordered by last activity."
        eyebrow="Buyer workspace · Pipeline"
        title="My deals"
      />
      {dealsQuery.isPending ? <WorkspaceSkeleton rows={2} /> : null}
      {dealsQuery.isError ? (
        <ErrorState
          description="Your deal pipeline could not be loaded."
          onRetry={() => void dealsQuery.refetch()}
          title="Deals unavailable"
        />
      ) : null}
      {dealsQuery.data && deals.length ? (
        <>
          <div className="mb-4 flex items-center justify-between text-xs text-ink-soft">
            <span>
              {dealsQuery.data.pagination.total.toLocaleString()} total deal
              {dealsQuery.data.pagination.total === 1 ? "" : "s"}
            </span>
            <span>
              Page {page} of{" "}
              {Math.max(dealsQuery.data.pagination.totalPages, 1)}
            </span>
          </div>
          <div className="space-y-3">
            {deals.map((deal, index) => {
              const listing = byDeal.get(deal.id);
              const listingQuery = listings[index];
              return (
                <SectionCard className="p-0 sm:p-0" key={deal.id}>
                  <div className="grid gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-5">
                    <div className="flex min-w-0 gap-3">
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-900">
                        <Building2 aria-hidden="true" size={18} />
                      </span>
                      <div className="min-w-0">
                        <Link
                          className="block truncate text-sm font-semibold text-navy-950 hover:text-emerald-900"
                          to={`/buyer/offers?deal=${deal.id}`}
                        >
                          {listing?.title ??
                            (listingQuery?.isError
                              ? "Business no longer publicly listed"
                              : `Loading business #${deal.listing_id}…`)}
                        </Link>
                        <p className="mt-1 truncate text-xs text-ink-soft">
                          {listing?.industry ? `${listing.industry} · ` : ""}
                          {listing?.location ?? `Listing #${deal.listing_id}`}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.68rem] text-ink-faint">
                          <span>Started {dateLabel(deal.created_at)}</span>
                          <span>Updated {dateLabel(deal.updated_at)}</span>
                          {listing ? (
                            <span>
                              Ask{" "}
                              {formatListingMoney(
                                listing.askingPrice,
                                listing.currency,
                              )}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-3 sm:justify-end">
                      <StatusBadge status={deal.status} />
                      <Button asChild size="sm" variant="outline">
                        <Link to={`/buyer/offers?deal=${deal.id}`}>
                          View offers
                        </Link>
                      </Button>
                    </div>
                  </div>
                </SectionCard>
              );
            })}
          </div>
          {dealsQuery.data.pagination.totalPages > 1 ? (
            <nav
              aria-label="Deals pages"
              className="mt-6 flex items-center justify-between border-t border-line pt-4"
            >
              <span className="text-xs text-ink-soft">
                Page {page} of {dealsQuery.data.pagination.totalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  disabled={page <= 1 || dealsQuery.isFetching}
                  onClick={() => setPage((value) => value - 1)}
                  size="sm"
                  variant="outline"
                >
                  <ChevronLeft aria-hidden="true" size={15} /> Previous
                </Button>
                <Button
                  disabled={
                    page >= dealsQuery.data.pagination.totalPages ||
                    dealsQuery.isFetching
                  }
                  onClick={() => setPage((value) => value + 1)}
                  size="sm"
                  variant="outline"
                >
                  Next <ChevronRight aria-hidden="true" size={15} />
                </Button>
              </div>
            </nav>
          ) : null}
        </>
      ) : null}
      {dealsQuery.data && deals.length === 0 ? (
        <SectionCard>
          <WorkspaceEmpty
            action={
              <Button asChild variant="accent">
                <Link to="/marketplace">Find a business</Link>
              </Button>
            }
            description="When you start a purchase from a published opportunity, the deal status and its next steps will appear here."
            title="Your deal pipeline is empty"
          />
        </SectionCard>
      ) : null}
    </>
  );
}
