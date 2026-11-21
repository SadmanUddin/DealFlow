import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import {
  BriefcaseBusiness,
  FileText,
  Handshake,
  MessageSquareText,
  Tag,
} from "lucide-react";
import { ErrorState } from "@/components/shared/ErrorState";
import {
  MetricCard,
  SectionCard,
  SectionHeading,
  StatusBadge,
  WorkspaceEmpty,
  WorkspacePageHeader,
  WorkspaceSkeleton,
} from "@/components/shared/workspace/WorkspaceUI";
import { listDeals, listOffers } from "@/features/deals/api";
import { listInquiries, listMyListings } from "./api";

export function SellerOverviewPage() {
  const listings = useQuery({
    queryKey: ["seller", "listings", 1, 100],
    queryFn: () => listMyListings(1, 100),
    staleTime: 15_000,
  });
  const inquiries = useQuery({
    queryKey: ["seller", "inquiries", 1, 100],
    queryFn: () => listInquiries(1, 100),
    staleTime: 15_000,
  });
  const deals = useQuery({
    queryKey: ["deals", "mine", 1, 20],
    queryFn: () => listDeals(1, 20),
    staleTime: 15_000,
  });
  const dealRows = useMemo(() => deals.data?.deals ?? [], [deals.data?.deals]);
  const offerQueries = useQueries({
    queries: dealRows.map((deal) => ({
      queryKey: ["deals", deal.id, "offers"],
      queryFn: () => listOffers(deal.id),
      staleTime: 15_000,
    })),
  });
  const listingRows = listings.data?.listings ?? [];
  const inquiryRows = inquiries.data?.conversations ?? [];
  const activeDeals = dealRows.filter(
    (deal) => !["completed", "cancelled", "rejected"].includes(deal.status),
  );
  const pendingOffers = offerQueries
    .flatMap((query) => query.data?.offers ?? [])
    .filter((offer) => offer.status === "pending").length;
  const loading =
    listings.isPending ||
    inquiries.isPending ||
    deals.isPending ||
    offerQueries.some((query) => query.isPending);
  const failed =
    listings.isError ||
    inquiries.isError ||
    deals.isError ||
    offerQueries.some((query) => query.isError);
  return (
    <>
      <WorkspacePageHeader
        description="Track the businesses you have brought to market and the buyer conversations that move them forward."
        eyebrow="Seller workspace"
        title="Seller overview"
        action={
          <Link
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800"
            to="/seller/listings/new"
          >
            Create a listing
          </Link>
        }
      />
      {loading ? <WorkspaceSkeleton rows={3} /> : null}
      {failed ? (
        <ErrorState
          description="Some seller workspace data could not be loaded."
          onRetry={() => {
            void listings.refetch();
            void inquiries.refetch();
            void deals.refetch();
          }}
          title="Seller overview unavailable"
        />
      ) : null}
      {!loading && !failed ? (
        <div className="space-y-8">
          <section
            aria-label="Seller summary"
            className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
          >
            <MetricCard
              detail={`${listingRows.filter((item) => item.status === "published").length} published · ${listingRows.filter((item) => item.status === "draft").length} drafts · ${listingRows.filter((item) => item.status === "pending").length} in review`}
              href="/seller/listings"
              icon={<BriefcaseBusiness size={18} />}
              label="Listings"
              value={listings.data?.pagination.total ?? 0}
            />
            <MetricCard
              detail="Buyer conversations across your businesses"
              href="/seller/inquiries"
              icon={<MessageSquareText size={18} />}
              label="Inquiries"
              value={inquiries.data?.pagination.total ?? 0}
            />
            <MetricCard
              detail="Offers awaiting a participant response"
              href="/seller/offers"
              icon={<Tag size={18} />}
              label="Pending offers"
              value={pendingOffers}
            />
            <MetricCard
              detail="Active among your 20 most recently updated deals"
              href="/seller/deals"
              icon={<Handshake size={18} />}
              label="Recent active deals"
              value={activeDeals.length}
            />
            <MetricCard
              detail="Listings that need an action from you"
              href="/seller/listings"
              icon={<FileText size={18} />}
              label="Drafts to complete"
              value={
                listingRows.filter(
                  (item) =>
                    item.status === "draft" || item.status === "rejected",
                ).length
              }
            />
          </section>
          <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
            <SectionCard>
              <SectionHeading
                action={
                  <Link
                    className="text-xs font-semibold text-emerald-800"
                    to="/seller/listings"
                  >
                    All listings
                  </Link>
                }
                description="Status and pricing for the most recent businesses in your portfolio."
                title="Listing portfolio"
              />
              {listingRows.length ? (
                <div className="divide-y divide-line">
                  {listingRows.slice(0, 5).map((listing) => (
                    <Link
                      className="flex items-center justify-between gap-3 py-3 first:pt-1 last:pb-1"
                      key={listing.id}
                      to={`/seller/listings/${listing.id}/edit`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-navy-950">
                          {listing.title}
                        </span>
                        <span className="mt-1 block text-xs text-ink-soft">
                          {listing.industry ?? "Industry not specified"} ·{" "}
                          {listing.location ?? "Location not specified"}
                        </span>
                      </span>
                      <StatusBadge status={listing.status} />
                    </Link>
                  ))}
                </div>
              ) : (
                <WorkspaceEmpty
                  description="Create a listing to start building your seller portfolio."
                  title="No businesses listed"
                />
              )}
            </SectionCard>
            <SectionCard>
              <SectionHeading
                action={
                  <Link
                    className="text-xs font-semibold text-emerald-800"
                    to="/seller/inquiries"
                  >
                    Open inquiries
                  </Link>
                }
                description="Most recent buyer conversations, ordered by creation date."
                title="Recent buyer interest"
              />
              {inquiryRows.length ? (
                <div className="divide-y divide-line">
                  {inquiryRows.slice(0, 5).map((inquiry) => (
                    <Link
                      className="flex items-center justify-between gap-3 py-3 first:pt-1 last:pb-1"
                      key={inquiry.id}
                      to={`/seller/inquiries/${inquiry.id}`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-navy-950">
                          {inquiry.listingTitle}
                        </span>
                        <span className="mt-1 block text-xs text-ink-soft">
                          Inquiry #{inquiry.id} ·{" "}
                          {new Intl.DateTimeFormat(undefined, {
                            dateStyle: "medium",
                          }).format(new Date(inquiry.createdAt))}
                        </span>
                      </span>
                      <StatusBadge status={inquiry.status} />
                    </Link>
                  ))}
                </div>
              ) : (
                <WorkspaceEmpty
                  description="Buyer conversations will appear when buyers contact you about published businesses."
                  title="No inquiries yet"
                />
              )}
            </SectionCard>
          </section>
        </div>
      ) : null}
    </>
  );
}
