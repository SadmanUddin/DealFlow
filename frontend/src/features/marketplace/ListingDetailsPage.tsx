import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import {
  ArrowLeft,
  ArrowUpRight,
  Building2,
  CalendarDays,
  ChartNoAxesCombined,
  MapPin,
  Tag,
} from "lucide-react";
import { Link, useNavigate, useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { retryQuery } from "@/app/providers/query-defaults";
import { Badge } from "@/components/ui/badge";
import { ErrorState } from "@/components/shared/ErrorState";
import { toApiError } from "@/lib/api-error";
import { useAuth } from "@/features/auth/useAuth";
import { startListingConversation } from "@/features/buyer/api";
import { listingImageSrc } from "./listing-image-url";
import { formatListingMoney } from "./marketplace-format";
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
        {listing.imageUrl && !imageFailed ? (
          <img
            alt=""
            className="absolute inset-0 size-full object-cover"
            src={listingImageSrc(listing.imageUrl)}
            onError={() => setFailedImageUrl(listing.imageUrl ?? null)}
          />
        ) : null}
        {listing.imageUrl && !imageFailed ? (
          <div className="absolute inset-0 bg-gradient-to-t from-white/95 via-white/25 to-transparent" />
        ) : (
          <>
            <div className="absolute -right-12 -top-28 size-96 rounded-full border border-emerald-900/[0.07]" />
            <div className="absolute -right-2 -top-16 size-64 rounded-full border border-emerald-900/[0.07]" />
          </>
        )}
        <div className="relative max-w-4xl">
          <Badge className="border-white bg-white/80">
            Published opportunity
          </Badge>
          <h1 className="mt-4 text-balance text-3xl font-semibold leading-tight tracking-[-0.05em] text-navy-950 sm:text-5xl lg:text-6xl">
            {listing.title}
          </h1>
          <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink-soft">
            <span>Published by {listing.sellerName || "Seller"}</span>
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
      {listing.website ? (
        <p className="mt-3 text-sm">
          <a
            className="font-semibold text-emerald-800 underline"
            href={listing.website}
            target="_blank"
            rel="noreferrer"
          >
            Visit business website
          </a>
        </p>
      ) : null}

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
            {user?.role === "buyer" ? (
              <Button
                disabled={favoriteMutation.isPending}
                onClick={() =>
                  favoriteMutation.mutate(Boolean(listing.isFavorite))
                }
                size="lg"
                variant="outline"
              >
                {listing.isFavorite
                  ? "Remove from saved businesses"
                  : "Save business"}
              </Button>
            ) : null}
            {user?.role === "buyer" ? (
              <Button
                disabled={inquiryMutation.isPending}
                onClick={() => inquiryMutation.mutate()}
                size="lg"
                variant="accent"
              >
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
                variant="accent"
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
                  className="text-xs font-medium text-ink-soft underline"
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
                        {category.replaceAll("_", " ")}
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
          <p className="mt-4 border-t border-line pt-4 text-xs leading-5 text-ink-faint">
            Public listing details are provided by{" "}
            {listing.sellerName || "the seller"}.
          </p>
        </Card>
      </div>
    </article>
  );
}
