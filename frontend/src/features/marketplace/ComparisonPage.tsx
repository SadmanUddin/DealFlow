import { useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { Link, useLocation } from "react-router";
import { Button } from "@/components/ui/button";
import { retryQuery } from "@/app/providers/query-defaults";
import { toApiError } from "@/lib/api-error";
import { useComparison } from "./comparison-context";
import { ListingMedia } from "./ListingMedia";
import { getPublishedListing, type PublicListing } from "./marketplace-api";
import { financialDisclosure, formatListingMoney } from "./marketplace-format";

type ComparisonRow = readonly [
  string,
  (listing: PublicListing) => string | null,
];

const financialFields = [
  ["Asking price", "askingPrice"],
  ["Annual revenue", "annualRevenue"],
  ["EBITDA", "ebitda"],
] as const;

const comparisonRows: ComparisonRow[] = [
  ["Status", (listing) => (listing.status === "sold" ? "Sold" : "Available")],
  ["Industry", (listing) => listing.industry],
  ["Location", (listing) => listing.location],
  ["Currency", (listing) => listing.currency],
  ...financialFields.map(([label, key]): ComparisonRow => [
    label,
    (listing) =>
      listing.status === "sold" && key !== "askingPrice"
        ? "—"
        : formatListingMoney(listing[key], listing.currency),
  ]),
  ["Description", (listing) => listing.description],
];

function ComparisonImage({ listing }: { listing: PublicListing }) {
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <div className="relative aspect-video overflow-hidden rounded-lg">
      <ListingMedia
        title={listing.title}
        industry={listing.industry}
        imageUrl={
          listing.imageUrl === failed ? null : (listing.imageUrl ?? null)
        }
        onImageError={() => setFailed(listing.imageUrl ?? null)}
      />
    </div>
  );
}

export function ComparisonPage() {
  const { state } = useLocation();
  const marketplace = {
    pathname: "/marketplace",
    search: state?.marketplaceSearch ?? "",
  };
  const { ids, remove, clear } = useComparison();
  const queries = useQueries({
    queries: ids.map((id) => ({
      queryKey: ["marketplace", "comparison", id],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        getPublishedListing(id, { signal, withCredentials: false }),
      retry: retryQuery,
      staleTime: 0,
      refetchOnWindowFocus: true,
      retryOnMount: true,
      gcTime: 0,
    })),
  });
  const listings = queries.map((query) =>
    query.isSuccess && query.isFetchedAfterMount ? query.data : undefined,
  );
  const currencies = new Set(
    listings.flatMap((listing) => (listing ? [listing.currency] : [])),
  );

  return (
    <section className="page-container py-10 sm:py-14">
      <Link
        className="text-sm font-semibold text-emerald-800 underline"
        to={marketplace}
      >
        Back to marketplace
      </Link>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-4xl text-navy-950 sm:text-5xl">
          Compare businesses
        </h1>
        {ids.length > 0 && (
          <Button variant="outline" onClick={clear}>
            Clear all
          </Button>
        )}
      </div>
      {ids.length === 0 ? (
        <div className="mt-6 rounded-xl border border-line bg-white p-6">
          <p>Select up to three businesses from the marketplace to compare.</p>
          <Button asChild className="mt-4">
            <Link to={marketplace}>Browse businesses</Link>
          </Button>
        </div>
      ) : (
        <>
          <p className="mt-3 text-sm text-ink-soft">{financialDisclosure}</p>
          {listings.some((listing) => listing?.status === "sold") && (
            <p className="mt-2 text-sm text-ink-soft">
              Asking prices for sold businesses are their original listing
              prices.
            </p>
          )}
          {currencies.size > 1 && (
            <p
              role="status"
              className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-950"
            >
              These listings use different currencies. Figures are shown in
              their original currencies, so direct financial comparisons may be
              misleading.
            </p>
          )}
          <div
            aria-label="Side-by-side listing comparison"
            role="region"
            tabIndex={ids.length > 1 ? 0 : undefined}
            className="mt-6 overflow-x-auto rounded-xl border border-line bg-white focus-visible:outline-2 focus-visible:outline-emerald-700"
          >
            <table
              className="w-full table-fixed border-collapse text-left text-sm"
              style={{
                minWidth: ids.length > 1 ? 120 + ids.length * 224 : undefined,
              }}
            >
              <caption className="sr-only">
                Selected businesses and their public listing details
              </caption>
              <thead>
                <tr className="align-top">
                  <th scope="col" className="w-24 p-3 sm:w-32">
                    Business
                  </th>
                  {ids.map((id, index) => {
                    const listing = listings[index];
                    const query = queries[index];
                    return (
                      <th
                        key={id}
                        scope="col"
                        className="break-words border-l border-line p-3"
                      >
                        {listing ? (
                          <>
                            <ComparisonImage listing={listing} />
                            <Link
                              className="mt-3 block font-semibold text-emerald-800 underline"
                              to={`/listings/${id}`}
                            >
                              {listing.title}
                            </Link>
                          </>
                        ) : query.isError ? (
                          toApiError(query.error).status === 404 ? (
                            <p role="status">
                              This listing is no longer available.
                            </p>
                          ) : (
                            <>
                              <p role="alert">Couldn’t load this listing.</p>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => void query.refetch()}
                                disabled={query.isFetching}
                              >
                                Retry
                              </Button>
                            </>
                          )
                        ) : (
                          <p role="status">Loading listing…</p>
                        )}
                        <Button
                          className="mt-2"
                          variant="outline"
                          size="sm"
                          aria-label={`Remove ${listing?.title ?? `listing ${id}`} from comparison`}
                          onClick={() => remove(id)}
                        >
                          Remove
                        </Button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map(([label, value]) => (
                  <tr
                    key={label}
                    className="border-t border-line align-top even:bg-paper"
                  >
                    <th scope="row" className="break-words p-3 font-semibold">
                      {label}
                    </th>
                    {ids.map((id, index) => {
                      const listing = listings[index];
                      return (
                        <td
                          key={id}
                          className="border-l border-line p-3 whitespace-pre-line break-words"
                        >
                          {listing
                            ? value(listing)?.trim() || "Not provided"
                            : "—"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
