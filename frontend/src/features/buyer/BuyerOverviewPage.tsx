import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Bell, Bookmark, Handshake, Search } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
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
import { useAuth } from "@/features/auth/useAuth";
import { listDeals } from "@/features/deals/api";
import { listFavorites, listNotifications } from "./api";
import { ListingCard } from "@/features/marketplace/ListingCard";

function shortDate(value: string | Date) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
    new Date(value),
  );
}

export function BuyerOverviewPage() {
  const { user } = useAuth();
  const savedQuery = useQuery({
    queryKey: ["buyer", "favorites", 1, 100],
    queryFn: () => listFavorites(1, 100),
    staleTime: 20_000,
  });
  const dealsQuery = useQuery({
    queryKey: ["deals", "mine", 1, 100],
    queryFn: () => listDeals(1, 100),
    staleTime: 20_000,
  });
  const notificationQuery = useQuery({
    queryKey: ["buyer", "notifications", "unread", 1],
    queryFn: () => listNotifications(1, 1, true),
    staleTime: 10_000,
  });
  const isPending =
    savedQuery.isPending || dealsQuery.isPending || notificationQuery.isPending;
  const hasError =
    savedQuery.isError || dealsQuery.isError || notificationQuery.isError;
  const name = user?.name?.trim().split(/\s+/)[0];

  return (
    <>
      <WorkspacePageHeader
        description="A clear view of the businesses you’re considering and the acquisitions in progress."
        eyebrow="Buyer workspace"
        title={`Welcome${name ? ` back, ${name}` : " back"}`}
        action={
          <Button asChild variant="accent">
            <Link to="/marketplace">
              <Search aria-hidden="true" size={16} /> Explore businesses
            </Link>
          </Button>
        }
      />
      {isPending ? <WorkspaceSkeleton rows={3} /> : null}
      {hasError ? (
        <ErrorState
          description="Your buyer workspace could not load all of its data. Try again to refresh your overview."
          onRetry={() => {
            void savedQuery.refetch();
            void dealsQuery.refetch();
            void notificationQuery.refetch();
          }}
          title="Overview unavailable"
        />
      ) : null}
      {!isPending && !hasError ? (
        <div className="space-y-8">
          <section
            aria-label="Buyer summary"
            className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
          >
            <MetricCard
              detail="Published businesses you saved"
              href="/buyer/saved"
              icon={<Bookmark aria-hidden="true" size={18} />}
              label="Saved businesses"
              value={savedQuery.data?.pagination.total ?? 0}
            />
            <MetricCard
              detail="Acquisitions involving your account"
              href="/buyer/deals"
              icon={<Handshake aria-hidden="true" size={18} />}
              label="Deals"
              value={dealsQuery.data?.pagination.total ?? 0}
            />
            <MetricCard
              detail="Unread items in your notification inbox"
              href="/buyer/notifications"
              icon={<Bell aria-hidden="true" size={18} />}
              label="Unread notifications"
              value={notificationQuery.data?.pagination.total ?? 0}
            />
          </section>

          <section>
            <SectionHeading
              action={
                <Link
                  className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-800 hover:text-emerald-950"
                  to="/buyer/saved"
                >
                  View saved <ArrowRight aria-hidden="true" size={14} />
                </Link>
              }
              description="Your latest saved public opportunities."
              title="Saved businesses"
            />
            {savedQuery.data?.favorites.length ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {savedQuery.data.favorites.slice(0, 3).map((favorite) => (
                  <ListingCard
                    key={favorite.id}
                    listing={{
                      id: favorite.listingId,
                      title: favorite.title,
                      description: favorite.description,
                      industry: favorite.industry,
                      location: favorite.location,
                      askingPrice: favorite.askingPrice,
                      annualRevenue: null,
                      ebitda: null,
                      currency: favorite.currency,
                      publishedAt: favorite.publishedAt,
                      createdAt: String(favorite.createdAt),
                    }}
                  />
                ))}
              </div>
            ) : (
              <SectionCard>
                <WorkspaceEmpty
                  action={
                    <Button asChild size="sm" variant="outline">
                      <Link to="/marketplace">Browse the marketplace</Link>
                    </Button>
                  }
                  description="Save businesses that match your acquisition criteria and return to them here."
                  title="No saved businesses yet"
                />
              </SectionCard>
            )}
          </section>

          <section className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
            <SectionCard>
              <SectionHeading
                action={
                  <Link
                    className="text-xs font-semibold text-emerald-800 hover:text-emerald-950"
                    to="/buyer/deals"
                  >
                    All deals
                  </Link>
                }
                description="Ordered by last update from the deal workspace."
                title="Recent deal activity"
              />
              {dealsQuery.data?.deals.length ? (
                <div className="divide-y divide-line">
                  {dealsQuery.data.deals.slice(0, 5).map((deal) => (
                    <Link
                      className="flex flex-col gap-2 py-3 first:pt-1 last:pb-1 sm:flex-row sm:items-center sm:justify-between"
                      key={deal.id}
                      to={`/buyer/offers?deal=${deal.id}`}
                    >
                      <span>
                        <span className="block text-sm font-semibold text-navy-950">
                          Acquisition #{deal.id}
                        </span>
                        <span className="mt-1 block text-xs text-ink-soft">
                          Updated {shortDate(deal.updated_at)}
                        </span>
                      </span>
                      <StatusBadge status={deal.status} />
                    </Link>
                  ))}
                </div>
              ) : (
                <WorkspaceEmpty
                  action={
                    <Button asChild size="sm" variant="outline">
                      <Link to="/marketplace">Find a business</Link>
                    </Button>
                  }
                  description="When you start an acquisition from a published listing, your deal activity will appear here."
                  title="No deals in progress"
                />
              )}
            </SectionCard>
            <SectionCard>
              <SectionHeading
                action={
                  <Link
                    className="text-xs font-semibold text-emerald-800 hover:text-emerald-950"
                    to="/buyer/notifications"
                  >
                    Open inbox
                  </Link>
                }
                description="Notifications generated by DealFlow activity."
                title="Recent notifications"
              />
              <NotificationsPreview />
            </SectionCard>
          </section>
        </div>
      ) : null}
    </>
  );
}

function NotificationsPreview() {
  const query = useQuery({
    queryKey: ["buyer", "notifications", "recent", 1, 6],
    queryFn: () => listNotifications(1, 6),
    staleTime: 10_000,
  });
  if (query.isPending)
    return (
      <div
        aria-label="Loading notifications"
        className="h-40 animate-pulse rounded-xl bg-mist"
        role="status"
      />
    );
  if (query.isError)
    return (
      <p className="text-xs text-rose-800" role="alert">
        Notifications could not be loaded.
      </p>
    );
  if (!query.data.notifications.length)
    return (
      <WorkspaceEmpty
        description="Deal updates and other account activity will appear here."
        title="Your inbox is clear"
      />
    );
  return (
    <div className="divide-y divide-line">
      {query.data.notifications.map((notification) => (
        <div
          className="flex gap-3 py-3 first:pt-1 last:pb-1"
          key={notification.id}
        >
          <span
            aria-hidden="true"
            className={`mt-1 size-2 shrink-0 rounded-full ${notification.readAt ? "bg-line" : "bg-emerald-600"}`}
          />
          <div className="min-w-0">
            <p className="break-words text-xs font-semibold text-navy-950">
              {notification.type.replaceAll(".", " ").replaceAll("_", " ")}
            </p>
            <p className="mt-1 text-[0.7rem] text-ink-soft">
              {shortDate(notification.createdAt)}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
