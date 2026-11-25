import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import {
  BriefcaseBusiness,
  Building2,
  ChartNoAxesCombined,
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
import { listDeals } from "@/features/deals/api";
import { listInquiries, listMyListings } from "./api";
import { fetchSellerAnalytics } from "./analytics-api";
import { useAuth } from "@/features/auth/useAuth";

export function SellerOverviewPage() {
  const listings = useQuery({
    queryKey: ["seller", "listings", 1, 100],
    queryFn: () => listMyListings(1, 100),
    staleTime: 45_000,
  });
  const inquiries = useQuery({
    queryKey: ["seller", "inquiries", 1, 100],
    queryFn: () => listInquiries(1, 100),
    staleTime: 45_000,
  });
  const { user } = useAuth();
  const analytics = useQuery({
    queryKey: ["seller", "analytics", user?.id, "overview", "30"],
    queryFn: () => fetchSellerAnalytics("30"),
    staleTime: 60_000,
    enabled: Boolean(user),
  });
  const activeDeals = useQuery({
    queryKey: ["deals", "mine", 1, 1, "open"],
    queryFn: () => listDeals(1, 1, "open"),
  });
  const listingRows = listings.data?.listings ?? [];
  const inquiryRows = inquiries.data?.conversations ?? [];
  const loading = listings.isPending || inquiries.isPending;
  const failed = listings.isError || inquiries.isError;
  return (
    <>
      <WorkspacePageHeader
        featured
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
          error={listings.error ?? inquiries.error}
          description="Some seller workspace data could not be loaded."
          onRetry={() => {
            void listings.refetch();
            void inquiries.refetch();
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
              detail="Awaiting a response across your listings"
              href="/seller/deals"
              icon={<Tag size={18} />}
              label="Pending offers"
              value={analytics.data?.pendingOffers ?? "—"}
            />
            <MetricCard
              detail="Acquisitions still in progress"
              href="/seller/deals"
              icon={<Handshake size={18} />}
              label="Active deals"
              value={activeDeals.data?.pagination.total ?? "—"}
            />
            <MetricCard
              detail="Completed acquisitions from your listings"
              href="/seller/deals/completed"
              icon={<Building2 size={18} aria-hidden="true" />}
              label="Sold businesses"
              value={listings.data?.soldCount ?? 0}
            />
            <MetricCard
              detail="Draft or rejected listings among your latest 100"
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
            <MetricCard
              detail="Recorded traffic in the last 30 UTC days"
              href="/seller/analytics"
              icon={<ChartNoAxesCombined size={18} />}
              label="Listing views"
              value={analytics.data?.totals.views ?? "N/A"}
            />
          </section>
          <section className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <SectionCard className="min-w-0">
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
            <SectionCard className="min-w-0">
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
