import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import {
  ArrowLeft,
  ArrowUpRight,
  Building2,
  CalendarDays,
  Heart,
  MessageSquare,
  MapPin,
  Tag,
} from "lucide-react";
import { Link, useNavigate, useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { retryQuery } from "@/app/providers/query-defaults";
import { Badge } from "@/components/ui/badge";
import { ErrorState } from "@/components/shared/ErrorState";
import { toApiError } from "@/lib/api-error";
import { useAuth } from "@/features/auth/useAuth";
import { startListingConversation } from "@/features/buyer/api";
import { SoldListingDetail } from "./SoldListingPresentation";
import { ListingViewPreference } from "./ListingViewPreference";
import { ListingMedia } from "./ListingMedia";
import { listingImageSrc } from "./listing-image-url";
import { financialDisclosure, formatListingMoney } from "./marketplace-format";
import { getPublishedListing } from "./marketplace-api";
import { createDeal } from "@/features/deals/api";
import {
  listingReportCategories,
  savePublishedListing,
  submitListingReport,
  unsavePublishedListing,
} from "./marketplace-api";

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
    <div
      className={`min-w-0 rounded-xl border p-4 ${emphasized ? "border-emerald-200 bg-emerald-50" : "border-line bg-paper"}`}
    >
      <dt className="text-sm font-medium text-ink-soft">{label}</dt>
      <dd className="mt-1.5 break-words text-xl font-semibold tracking-tight text-navy-950 tabular-nums">
        {value}
      </dd>
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
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [dealError, setDealError] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [reportCategory, setReportCategory] =
    useState<(typeof listingReportCategories)[number]>("other");
  const [reportDescription, setReportDescription] = useState("");
  const [reportValidationError, setReportValidationError] = useState("");
  const [reportNotice, setReportNotice] = useState("");
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const favoriteMutation = useMutation({
    mutationFn: async (saved: boolean) => {
      if (saved) await unsavePublishedListing(id);
      else await savePublishedListing(id);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["marketplace", "listing", id],
        }),
        queryClient.invalidateQueries({ queryKey: ["buyer", "favorites"] }),
      ]);
    },
  });
  const startDealMutation = useMutation({
    mutationFn: () => createDeal(id),
    onSuccess: async ({ deal }) => {
      setDealError("");
      await queryClient.invalidateQueries({ queryKey: ["deals", "mine"] });
      await navigate(`/buyer/deals/${deal.id}`);
    },
    onError: (error) => setDealError(toApiError(error).message),
  });
  const inquiryMutation = useMutation({
    mutationFn: () => startListingConversation(id),
    onSuccess: async ({ conversation }) => {
      await queryClient.invalidateQueries({
        queryKey: ["workspace", "conversations", "buyer"],
      });
      navigate(`/buyer/conversations?conversation=${conversation.id}`, {
        state: { notice: "Your private seller conversation is ready." },
      });
    },
  });
  const reportMutation = useMutation({
    mutationFn: () =>
      submitListingReport({
        listingId: id,
        category: reportCategory,
        description: reportDescription.trim(),
      }),
    onSuccess: ({ created }) => {
      setReportNotice(
        created
          ? "Thank you. Your report has been sent to the DealFlow review team."
          : "A matching report is already under review.",
      );
      setReportDescription("");
      setReportOpen(false);
    },
  });
  const listingQuery = useQuery({
    queryKey: ["marketplace", "listing", validId ? id : null],
    queryFn: () => getPublishedListing(id),
    enabled: validId,
    retry: retryQuery,
    staleTime: 0,
    refetchOnWindowFocus: true,
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
          error={listingQuery.error}
          description="We couldn’t load this public listing. Check your connection and try again."
          onRetry={() => void listingQuery.refetch()}
          title="Listing unavailable right now"
        />
      </div>
    );
  }

  const listing = listingQuery.data;
  const imageFailed = failedImageUrl === listing.imageUrl;
  const viewPreference =
    import.meta.env.VITE_LISTING_VIEW_TRACKING === "true" &&
    user?.emailVerified && user.role !== "admin" ? (
      <ListingViewPreference key={user.id} accountId={user.id} listingId={id} />
    ) : null;
  if (listing.status === "sold") {
    return (
      <>
        <SoldListingDetail
          listing={listing}
          imageUrl={imageFailed ? null : (listing.imageUrl ?? null)}
          onImageError={() => setFailedImageUrl(listing.imageUrl ?? null)}
        />
        {viewPreference}
      </>
    );
  }
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

      <header className="mt-5 mb-7 grid gap-5 border-b border-line pb-7 sm:mt-7 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)] lg:items-end">
        <div className="min-w-0">
          <Badge className="border-emerald-200 bg-emerald-50 text-emerald-900">
            Available for acquisition
          </Badge>
          <h1 className="mt-4 max-w-5xl break-words font-display text-5xl leading-[0.98] tracking-[-0.035em] text-navy-950 sm:text-6xl lg:text-7xl">
            {listing.title}
          </h1>
          <ul
            className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink-soft"
            aria-label="Listing details"
          >
            {listing.industry && (
              <li className="inline-flex items-center gap-1.5">
                <Tag
                  aria-hidden="true"
                  className="shrink-0 text-emerald-800"
                  size={15}
                />
                {listing.industry}
              </li>
            )}
            {listing.location && (
              <li className="inline-flex items-center gap-1.5">
                <MapPin
                  aria-hidden="true"
                  className="shrink-0 text-emerald-800"
                  size={15}
                />
                {listing.location}
              </li>
            )}
            {dateLabel && (
              <li className="inline-flex items-center gap-1.5">
                <CalendarDays
                  aria-hidden="true"
                  className="shrink-0 text-emerald-800"
                  size={15}
                />
                Published {dateLabel}
              </li>
            )}
          </ul>
        </div>
        <dl className="w-full max-w-sm lg:max-w-none">
          <DetailMetric
            emphasized
            label="Asking price"
            value={formatListingMoney(listing.askingPrice, listing.currency)}
          />
        </dl>
      </header>

      <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)]">
        <figure className="min-w-0 lg:col-start-1 lg:row-start-1">
          <div className="relative aspect-[16/9] overflow-hidden rounded-2xl border border-line">
            <ListingMedia
              industry={listing.industry}
              title={listing.title}
              imageUrl={imageFailed ? null : (listing.imageUrl ?? null)}
              onImageError={() => setFailedImageUrl(listing.imageUrl ?? null)}
              eager
            />
          </div>
          {listing.imageUrl && !imageFailed && (
            <figcaption className="mt-2 flex flex-wrap items-center justify-between gap-x-4 text-xs text-ink-soft">
              <span>Business photo provided by the seller</span>
              <a
                className="inline-flex min-h-9 items-center rounded-sm font-semibold text-emerald-900 underline underline-offset-4"
                href={listingImageSrc(listing.imageUrl)}
                target="_blank"
                rel="noreferrer"
              >
                Open full-size photo
              </a>
            </figcaption>
          )}
        </figure>
        <aside className="min-w-0 rounded-2xl border border-emerald-900/15 bg-white p-5 shadow-card sm:p-6 lg:sticky lg:top-24 lg:col-start-2 lg:row-span-3 lg:row-start-1">
          <div className="flex items-center gap-3 border-b border-line pb-4">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-900">
              <Building2 aria-hidden="true" size={20} />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-900">
                Seller
              </p>
              <p className="break-words text-sm font-medium text-ink-soft">
                Published by {listing.sellerName || "the seller"}
              </p>
            </div>
          </div>
          <h2 className="mt-5 font-display text-3xl leading-tight text-navy-950">
            Interested in this business?
          </h2>
          <p className="mt-2 text-sm leading-6 text-ink-soft">
            {user?.role === "buyer"
              ? "You’re signed in as a buyer. Ask the seller a question or start an acquisition when you’re ready."
              : user
                ? "Buyer accounts can contact sellers about this listing."
                : "Sign in or create a buyer account to ask the seller a question or save this listing."}
          </p>
          <div className="mt-5 flex flex-col gap-2.5">
            {user?.role === "buyer" ? (
              <Button
                disabled={inquiryMutation.isPending}
                onClick={() => inquiryMutation.mutate()}
                size="lg"
                variant="accent"
              >
                <MessageSquare aria-hidden="true" size={17} />
                {inquiryMutation.isPending
                  ? "Opening conversation…"
                  : "Contact seller"}
              </Button>
            ) : null}
            {user?.role === "buyer" ? (
              <Button
                disabled={startDealMutation.isPending}
                onClick={() => {
                  setDealError("");
                  startDealMutation.mutate();
                }}
                size="lg"
                variant="outline"
              >
                {startDealMutation.isPending
                  ? "Opening acquisition…"
                  : "Start acquisition"}
                <ArrowUpRight aria-hidden="true" size={16} />
              </Button>
            ) : user ? (
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
              <Button
                disabled={favoriteMutation.isPending}
                onClick={() =>
                  favoriteMutation.mutate(Boolean(listing.isFavorite))
                }
                size="lg"
                variant="outline"
              >
                <Heart
                  aria-hidden="true"
                  size={16}
                  fill={listing.isFavorite ? "currentColor" : "none"}
                />
                {listing.isFavorite
                  ? "Remove from saved businesses"
                  : "Save business"}
              </Button>
            ) : null}
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
          {dealError ? (
            <p
              className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-900"
              role="alert"
            >
              {dealError}
            </p>
          ) : null}
          {favoriteMutation.isError ? (
            <p
              className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-900"
              role="alert"
            >
              {toApiError(favoriteMutation.error).message}
            </p>
          ) : null}
          {inquiryMutation.isError ? (
            <p
              className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-900"
              role="alert"
            >
              {toApiError(inquiryMutation.error).message}
            </p>
          ) : null}
          {reportNotice ? (
            <p
              className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-900"
              role="status"
            >
              {reportNotice}
            </p>
          ) : null}
          {user ? (
            <div className="mt-4 border-t border-line pt-3">
              {!reportOpen ? (
                <button
                  type="button"
                  className="min-h-10 rounded-sm text-sm font-medium text-ink-soft underline underline-offset-4"
                  onClick={() => {
                    setReportNotice("");
                    setReportValidationError("");
                    setReportOpen(true);
                  }}
                >
                  Report this listing
                </button>
              ) : (
                <form
                  className="space-y-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const valid = z
                      .string()
                      .trim()
                      .min(10)
                      .max(5000)
                      .safeParse(reportDescription);
                    if (valid.success) {
                      setReportValidationError("");
                      reportMutation.mutate();
                    } else {
                      setReportValidationError(
                        "Describe the issue in at least 10 characters.",
                      );
                    }
                  }}
                >
                  <label
                    className="block text-xs font-semibold"
                    htmlFor="report-category"
                  >
                    Reason
                  </label>
                  <select
                    id="report-category"
                    className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm"
                    value={reportCategory}
                    onChange={(event) =>
                      setReportCategory(
                        event.target
                          .value as (typeof listingReportCategories)[number],
                      )
                    }
                  >
                    {listingReportCategories.map((category) => (
                      <option key={category} value={category}>
                        {category.charAt(0).toUpperCase() +
                          category.slice(1).replaceAll("_", " ")}
                      </option>
                    ))}
                  </select>
                  <label
                    className="block text-xs font-semibold"
                    htmlFor="report-description"
                  >
                    Tell us what is wrong (10–5,000 characters)
                  </label>
                  <textarea
                    id="report-description"
                    className="min-h-24 w-full rounded-lg border border-line px-3 py-2 text-sm"
                    minLength={10}
                    maxLength={5000}
                    required
                    value={reportDescription}
                    onChange={(event) => {
                      setReportDescription(event.target.value);
                      setReportValidationError("");
                    }}
                  />
                  {reportValidationError ? (
                    <p role="alert" className="text-xs text-rose-800">
                      {reportValidationError}
                    </p>
                  ) : null}
                  {reportMutation.isError ? (
                    <p role="alert" className="text-xs text-rose-800">
                      {toApiError(reportMutation.error).message}
                    </p>
                  ) : null}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="accent"
                      disabled={
                        reportMutation.isPending ||
                        reportDescription.trim().length < 10
                      }
                    >
                      {reportMutation.isPending ? "Sending…" : "Submit report"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setReportOpen(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              )}
            </div>
          ) : null}
        </aside>
        <section className="lg:col-start-1 lg:row-start-2 min-w-0 rounded-2xl border border-line bg-white p-5 sm:p-7">
          <h2 className="font-display text-3xl leading-tight text-navy-950">
            Financial information
          </h2>
          <dl className="mt-4 grid gap-2.5 sm:grid-cols-2">
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
          </dl>
          <p className="mt-3 text-sm leading-6 text-ink-soft">
            {financialDisclosure} Currency: {listing.currency}.
          </p>
        </section>
        <section className="lg:col-start-1 lg:row-start-3 min-w-0 rounded-2xl border border-line bg-white p-5 sm:p-7">
          <h2 className="font-display text-3xl leading-tight text-navy-950">
            About this business
          </h2>
          <p className="mt-4 max-w-prose whitespace-pre-line break-words text-base leading-7 text-ink-soft">
            {listing.description}
          </p>
          {listing.website && (
            <a
              className="mt-4 inline-flex min-h-10 items-center font-semibold text-emerald-900 underline underline-offset-4"
              href={listing.website}
              target="_blank"
              rel="noreferrer"
            >
              Visit business website
            </a>
          )}
        </section>
      </div>
      {viewPreference}
    </article>
  );
}
