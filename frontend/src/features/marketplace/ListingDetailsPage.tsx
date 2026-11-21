import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowUpRight,
  Building2,
  CalendarDays,
  ChartNoAxesCombined,
  MapPin,
  Tag,
} from "lucide-react";
import { Link, useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ErrorState } from "@/components/shared/ErrorState";
import { toApiError } from "@/lib/api-error";
import { useAuth } from "@/features/auth/useAuth";
import { formatListingMoney } from "./marketplace-format";
import { getPublishedListing } from "./marketplace-api";

function ListingDetailSkeleton() {
  return (
    <div
      aria-label="Loading business listing"
      className="page-container py-10 sm:py-14"
      role="status"
    >
      <div className="h-4 w-32 animate-pulse rounded bg-mist" />
      <div className="mt-7 h-64 animate-pulse rounded-[1.75rem] bg-mist sm:h-80" />
      <div className="mt-7 grid gap-6 lg:grid-cols-[1fr_21rem]">
        <div className="space-y-4 rounded-2xl border border-line bg-white p-6 sm:p-8">
          <div className="h-8 w-2/3 animate-pulse rounded bg-mist" />
          <div className="h-4 w-1/3 animate-pulse rounded bg-mist" />
          <div className="mt-8 h-28 animate-pulse rounded bg-mist" />
        </div>
        <div className="h-56 animate-pulse rounded-2xl bg-mist" />
      </div>
    </div>
  );
}

function DetailMetric({
  label,
  value,
  emphasized = false,
}: {
  label: string;
  value: string;
  emphasized?: boolean;
}) {
  return (
    <div className="rounded-xl border border-line bg-white p-4 sm:p-5">
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-ink-faint">
        {label}
      </p>
      <p
        className={`mt-2 break-words text-lg font-semibold tracking-tight ${emphasized ? "text-emerald-800" : "text-navy-950"}`}
      >
        {value}
      </p>
    </div>
  );
}

function ListingNotFound() {
  return (
    <section className="page-container grid min-h-[65vh] place-items-center py-16">
      <div className="max-w-lg text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-800">
          <Building2 aria-hidden="true" size={24} />
        </span>
        <p className="eyebrow mt-6 text-emerald-800">Listing unavailable</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-navy-950">
          This opportunity can’t be found
        </h1>
        <p className="mt-3 text-sm leading-6 text-ink-soft">
          It may have been removed or is no longer publicly available.
        </p>
        <Button asChild className="mt-6" variant="accent">
          <Link to="/marketplace">
            <ArrowLeft aria-hidden="true" size={15} /> Back to marketplace
          </Link>
        </Button>
      </div>
    </section>
  );
}

export function ListingDetailsPage() {
  const { id: rawId } = useParams();
  const id = rawId && /^[1-9]\d*$/.test(rawId) ? Number(rawId) : NaN;
  const validId = Number.isSafeInteger(id) && id > 0;
  const { user } = useAuth();
  const listingQuery = useQuery({
    queryKey: ["marketplace", "listing", validId ? id : null],
    queryFn: () => getPublishedListing(id),
    enabled: validId,
    retry: (failureCount, error) =>
      toApiError(error).status !== 404 && failureCount < 1,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  if (
    !validId ||
    (listingQuery.isError && toApiError(listingQuery.error).status === 404)
  ) {
    return <ListingNotFound />;
  }
  if (listingQuery.isPending) return <ListingDetailSkeleton />;
  if (listingQuery.isError || !listingQuery.data) {
    return (
      <div className="page-container py-12 sm:py-16">
        <Button asChild className="mb-6" size="sm" variant="ghost">
          <Link to="/marketplace">
            <ArrowLeft aria-hidden="true" size={15} /> Marketplace
          </Link>
        </Button>
        <ErrorState
          description="We couldn’t load this public listing. Check your connection and try again."
          onRetry={() => void listingQuery.refetch()}
          title="Listing unavailable right now"
        />
      </div>
    );
  }

  const listing = listingQuery.data;
  const publishedDate = listing.publishedAt
    ? new Date(listing.publishedAt)
    : null;
  const dateLabel =
    publishedDate && !Number.isNaN(publishedDate.getTime())
      ? new Intl.DateTimeFormat(undefined, { dateStyle: "long" }).format(
          publishedDate,
        )
      : null;

  return (
    <article className="page-container py-8 sm:py-12">
      <Link
        className="inline-flex items-center gap-2 rounded-lg py-2 text-sm font-semibold text-emerald-800 transition hover:text-emerald-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-700/20"
        to="/marketplace"
      >
        <ArrowLeft aria-hidden="true" size={16} /> Back to marketplace
      </Link>

      <div className="relative mt-5 flex min-h-56 items-end overflow-hidden rounded-[1.75rem] border border-emerald-900/[0.05] bg-[radial-gradient(ellipse_at_80%_5%,#d8eee1,transparent_40%),linear-gradient(135deg,#fff,#eef3f7_58%,#edf3f0)] p-6 sm:min-h-72 sm:p-10 lg:min-h-80">
        <div className="absolute -right-12 -top-28 size-96 rounded-full border border-emerald-900/[0.07]" />
        <div className="absolute -right-2 -top-16 size-64 rounded-full border border-emerald-900/[0.07]" />
        <div className="relative max-w-4xl">
          <Badge className="border-white bg-white/80">
            Published opportunity
          </Badge>
          <h1 className="mt-4 text-balance text-3xl font-semibold leading-tight tracking-[-0.05em] text-navy-950 sm:text-5xl lg:text-6xl">
            {listing.title}
          </h1>
          <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink-soft">
            {listing.industry ? (
              <span className="inline-flex items-center gap-1.5">
                <Tag
                  aria-hidden="true"
                  className="text-emerald-800"
                  size={15}
                />
                {listing.industry}
              </span>
            ) : null}
            {listing.location ? (
              <span className="inline-flex items-center gap-1.5">
                <MapPin
                  aria-hidden="true"
                  className="text-emerald-800"
                  size={15}
                />
                {listing.location}
              </span>
            ) : null}
            {dateLabel ? (
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays
                  aria-hidden="true"
                  className="text-emerald-800"
                  size={15}
                />
                Published {dateLabel}
              </span>
            ) : null}
          </div>
        </div>
        <Building2
          aria-hidden="true"
          className="absolute bottom-8 right-8 hidden text-emerald-900/10 sm:block"
          size={100}
          strokeWidth={1}
        />
      </div>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="space-y-6">
          <Card className="p-5 sm:p-8">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-emerald-50 text-emerald-800">
                <Building2 aria-hidden="true" size={18} />
              </span>
              <div>
                <p className="eyebrow text-emerald-800">Business overview</p>
                <h2 className="mt-1 text-xl font-semibold tracking-tight text-navy-950">
                  About this business
                </h2>
              </div>
            </div>
            <p className="mt-6 whitespace-pre-line text-sm leading-7 text-ink-soft sm:text-base sm:leading-8">
              {listing.description}
            </p>
          </Card>

          <Card className="p-5 sm:p-8">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-emerald-50 text-emerald-800">
                <ChartNoAxesCombined aria-hidden="true" size={18} />
              </span>
              <div>
                <p className="eyebrow text-emerald-800">At a glance</p>
                <h2 className="mt-1 text-xl font-semibold tracking-tight text-navy-950">
                  Financial information
                </h2>
              </div>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <DetailMetric
                emphasized
                label="Asking price"
                value={formatListingMoney(
                  listing.askingPrice,
                  listing.currency,
                )}
              />
              <DetailMetric
                label="Annual revenue"
                value={formatListingMoney(
                  listing.annualRevenue,
                  listing.currency,
                )}
              />
              <DetailMetric
                label="EBITDA"
                value={formatListingMoney(listing.ebitda, listing.currency)}
              />
            </div>
            <p className="mt-3 text-xs leading-5 text-ink-faint">
              Amounts are shown in the listing’s stated currency (
              {listing.currency}).
            </p>
          </Card>
        </div>

        <Card className="sticky top-24 p-5 sm:p-6">
          <p className="eyebrow text-emerald-800">Next step</p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-navy-950">
            Interested in this business?
          </h2>
          <p className="mt-2 text-sm leading-6 text-ink-soft">
            {user?.role === "buyer"
              ? "You’re signed in as a buyer. Continue exploring the public marketplace or review your account."
              : user
                ? `You’re signed in as a ${user.role}. Continue exploring the public marketplace or review your account.`
                : "Sign in to continue with DealFlow, or create an account to get started."}
          </p>
          <div className="mt-5 flex flex-col gap-2.5">
            {user ? (
              <Button asChild size="lg" variant="accent">
                <Link to="/marketplace">
                  Explore more businesses{" "}
                  <ArrowUpRight aria-hidden="true" size={16} />
                </Link>
              </Button>
            ) : (
              <Button asChild size="lg" variant="accent">
                <Link
                  state={{ from: { pathname: `/listings/${listing.id}` } }}
                  to="/login"
                >
                  Sign in to DealFlow{" "}
                  <ArrowUpRight aria-hidden="true" size={16} />
                </Link>
              </Button>
            )}
            {user?.role === "buyer" ? (
              <Button asChild size="lg" variant="outline">
                <Link to="/buyer/saved">Saved businesses</Link>
              </Button>
            ) : user ? (
              <Button asChild size="lg" variant="outline">
                <Link to="/account">My account</Link>
              </Button>
            ) : (
              <Button asChild size="lg" variant="outline">
                <Link to="/register">Create an account</Link>
              </Button>
            )}
          </div>
          <p className="mt-4 border-t border-line pt-4 text-xs leading-5 text-ink-faint">
            Public listing details are provided by the seller. Seller identity
            and private documents are not displayed here.
          </p>
        </Card>
      </div>
    </article>
  );
}
