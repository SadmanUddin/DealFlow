import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  ChevronDown,
  MapPin,
  Search,
  SlidersHorizontal,
  Tag,
  X,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/shared/ErrorState";
import { retryQuery } from "@/app/providers/query-defaults";
import {
  getPublicListings,
  parseMarketplaceFilters,
  serializeMarketplaceFilters,
  type MarketplaceFilters,
} from "./marketplace-api";
import { ListingCard } from "./ListingCard";
import { ListingCardSkeleton } from "./ListingCardSkeleton";

import { comparisonLimit, useComparison } from "./comparison-context";

type SearchDraft = {
  q: string;
  industry: string;
  location: string;
  minPrice: string;
  maxPrice: string;
  minRevenue: string;
  maxRevenue: string;
  minEbitda: string;
  maxEbitda: string;
};

function hasCriteria(filters: MarketplaceFilters) {
  return Boolean(
    filters.q ||
    filters.industry ||
    filters.location ||
    filters.minPrice ||
    filters.maxPrice ||
    filters.minRevenue ||
    filters.maxRevenue ||
    filters.minEbitda ||
    filters.maxEbitda,
  );
}

export function MarketplacePage() {
  const comparison = useComparison();
  const limitReached = comparison.ids.length >= comparisonLimit;
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useMemo(
    () => parseMarketplaceFilters(searchParams.toString()),
    [searchParams],
  );
  const criteriaDraft: SearchDraft = {
    q: filters.q ?? "",
    industry: filters.industry ?? "",
    location: filters.location ?? "",
    minPrice: filters.minPrice ?? "",
    maxPrice: filters.maxPrice ?? "",
    minRevenue: filters.minRevenue ?? "",
    maxRevenue: filters.maxRevenue ?? "",
    minEbitda: filters.minEbitda ?? "",
    maxEbitda: filters.maxEbitda ?? "",
  };
  const criteriaKey = JSON.stringify(criteriaDraft);
  const [searchDraft, setSearchDraft] = useState<{
    key: string;
    draft: SearchDraft;
  }>();
  const draft =
    searchDraft?.key === criteriaKey ? searchDraft.draft : criteriaDraft;
  const setDraft = (update: (current: SearchDraft) => SearchDraft) =>
    setSearchDraft((current) => ({
      key: criteriaKey,
      draft: update(
        current?.key === criteriaKey ? current.draft : criteriaDraft,
      ),
    }));
  const [filterError, setFilterError] = useState("");
  const [financialFiltersPreference, setFinancialFiltersPreference] =
    useState<boolean>();
  const financialFiltersOpen =
    financialFiltersPreference ??
    Boolean(
      filters.minPrice ||
      filters.maxPrice ||
      filters.minRevenue ||
      filters.maxRevenue ||
      filters.minEbitda ||
      filters.maxEbitda,
    );

  const applySearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFilterError("");
    const amountPattern = /^\d{1,16}(\.\d{1,2})?$/;
    const amounts = [
      draft.minPrice,
      draft.maxPrice,
      draft.minRevenue,
      draft.maxRevenue,
      draft.minEbitda,
      draft.maxEbitda,
    ];
    if (amounts.some((value) => value && !amountPattern.test(value))) {
      setFilterError(
        "Enter a non-negative amount with up to two decimal places.",
      );
      return;
    }
    if (
      (draft.minPrice &&
        draft.maxPrice &&
        Number(draft.minPrice) > Number(draft.maxPrice)) ||
      (draft.minRevenue &&
        draft.maxRevenue &&
        Number(draft.minRevenue) > Number(draft.maxRevenue)) ||
      (draft.minEbitda &&
        draft.maxEbitda &&
        Number(draft.minEbitda) > Number(draft.maxEbitda))
    ) {
      setFilterError("Each minimum must be less than or equal to its maximum.");
      return;
    }
    setSearchDraft(undefined);
    setSearchParams(
      serializeMarketplaceFilters({
        ...filters,
        page: 1,
        q: draft.q.trim() || undefined,
        industry: draft.industry.trim() || undefined,
        location: draft.location.trim() || undefined,
        minPrice: draft.minPrice || undefined,
        maxPrice: draft.maxPrice || undefined,
        minRevenue: draft.minRevenue || undefined,
        maxRevenue: draft.maxRevenue || undefined,
        minEbitda: draft.minEbitda || undefined,
        maxEbitda: draft.maxEbitda || undefined,
      }),
    );
  };

  const updateFilters = (
    update: Partial<MarketplaceFilters>,
    resetPage = true,
  ) => {
    setSearchParams(
      serializeMarketplaceFilters({
        ...filters,
        ...update,
        page: resetPage ? 1 : (update.page ?? filters.page),
      }),
    );
  };

  const clearSearch = () => {
    setFilterError("");
    setSearchDraft(undefined);
    setSearchParams(
      serializeMarketplaceFilters({
        page: 1,
        limit: filters.limit,
        sort: "newest",
        availability: filters.availability,
      }),
      { replace: true },
    );
  };

  const listingsQuery = useQuery({
    queryKey: ["marketplace", filters],
    queryFn: () => getPublicListings(filters),
    retry: retryQuery,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  const page = listingsQuery.data?.pagination;
  const activeCriteria = hasCriteria(filters);

  return (
    <>
      <section className="border-b border-emerald-950/15 bg-emerald-950 text-white">
        <div className="page-container pt-12 pb-8 sm:pt-16 sm:pb-10">
          <div className="grid gap-5 lg:grid-cols-[1fr_20rem] lg:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-200">
                Marketplace
              </p>
              <h1 className="mt-4 max-w-4xl text-balance font-display text-5xl leading-[0.98] tracking-[-0.035em] sm:text-6xl lg:text-7xl">
                Businesses for sale.
              </h1>
            </div>
            <p className="max-w-sm text-base leading-7 text-emerald-50/85">
              Compare asking prices and financials, find businesses in the
              industries you know, and contact sellers directly.
            </p>
          </div>
          <form
            aria-label="Search marketplace"
            className="mt-8 rounded-2xl border border-white/20 bg-white p-3 text-ink shadow-card sm:p-4"
            onSubmit={applySearch}
          >
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
              {(
                [
                  [
                    "q",
                    "Business",
                    "Search businesses",
                    "Name or description",
                    200,
                    Search,
                  ],
                  [
                    "industry",
                    "Industry",
                    "Industry / category",
                    "Any industry",
                    120,
                    Tag,
                  ],
                  [
                    "location",
                    "Location",
                    "Location",
                    "Any city or country",
                    160,
                    MapPin,
                  ],
                ] as const
              ).map(
                ([
                  key,
                  title,
                  accessibleName,
                  placeholder,
                  maxLength,
                  Icon,
                ]) => (
                  <label
                    key={key}
                    className="flex min-w-0 items-center gap-3 rounded-xl border border-line bg-paper px-3.5 focus-within:border-emerald-700 focus-within:ring-2 focus-within:ring-emerald-700/15"
                  >
                    <Icon
                      aria-hidden="true"
                      className="shrink-0 text-emerald-800"
                      size={18}
                    />
                    <span className="min-w-0 flex-1 py-2.5">
                      <span className="block text-xs font-semibold text-ink">
                        {title}
                      </span>
                      <input
                        aria-label={accessibleName}
                        className="w-full min-w-0 bg-transparent text-sm font-medium text-navy-950 outline-none placeholder:font-normal placeholder:text-ink-soft"
                        maxLength={maxLength}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            [key]: event.target.value,
                          }))
                        }
                        placeholder={placeholder}
                        type={key === "q" ? "search" : "text"}
                        value={draft[key]}
                      />
                    </span>
                  </label>
                ),
              )}
              <Button
                className="h-full min-h-12 rounded-xl px-6"
                size="lg"
                type="submit"
                variant="accent"
              >
                <Search aria-hidden="true" size={17} /> Search
              </Button>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line pt-2">
              <button
                aria-controls="marketplace-financial-filters"
                aria-expanded={financialFiltersOpen}
                className="inline-flex min-h-10 items-center gap-2 rounded-md px-2 text-sm font-semibold text-emerald-900 hover:bg-emerald-50"
                onClick={() =>
                  setFinancialFiltersPreference(!financialFiltersOpen)
                }
                type="button"
              >
                <SlidersHorizontal aria-hidden="true" size={16} /> Financial
                filters
                <ChevronDown
                  aria-hidden="true"
                  size={15}
                  className={financialFiltersOpen ? "rotate-180" : ""}
                />
              </button>
              {activeCriteria && (
                <button
                  className="inline-flex min-h-10 items-center gap-1 rounded-md px-2 text-sm font-semibold text-ink-soft hover:bg-mist"
                  onClick={clearSearch}
                  type="button"
                >
                  <X aria-hidden="true" size={15} /> Clear
                </button>
              )}
            </div>
            {financialFiltersOpen && (
              <fieldset
                id="marketplace-financial-filters"
                className="rounded-xl border border-line bg-paper px-4 py-3"
              >
                <legend className="px-1 text-sm font-semibold text-ink">
                  Financial ranges
                </legend>
                <p className="text-xs leading-5 text-ink-soft">
                  Ranges use each listing’s stated currency. Amounts are not
                  converted.
                </p>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  {(
                    [
                      ["minPrice", "maxPrice", "Asking price"],
                      ["minRevenue", "maxRevenue", "Annual revenue"],
                      ["minEbitda", "maxEbitda", "EBITDA"],
                    ] as const
                  ).map(([minKey, maxKey, label]) => (
                    <div key={minKey}>
                      <p className="mb-1.5 text-sm font-medium text-ink">
                        {label}
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        {(
                          [
                            ["Minimum", minKey],
                            ["Maximum", maxKey],
                          ] as const
                        ).map(([bound, key]) => (
                          <input
                            key={key}
                            aria-label={`${bound} ${label}`}
                            inputMode="decimal"
                            maxLength={19}
                            placeholder={bound}
                            value={draft[key]}
                            onChange={(event) =>
                              setDraft((current) => ({
                                ...current,
                                [key]: event.target.value,
                              }))
                            }
                            className="h-11 min-w-0 rounded-lg border border-line bg-white px-2.5 text-sm tabular-nums focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/15"
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </fieldset>
            )}
            {filterError && (
              <p
                role="alert"
                className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800"
              >
                {filterError}
              </p>
            )}
          </form>
        </div>
      </section>

      <section className="page-container py-8 sm:py-12">
        <div
          className="mb-6 flex flex-wrap items-center gap-2 border-b border-line pb-5"
          aria-label="Browse by industry"
        >
          <span className="mr-2 text-sm font-semibold text-ink">
            Browse by industry
          </span>
          {["Technology", "Food", "Retail", "Services", "Manufacturing"].map(
            (industry) => (
              <button
                key={industry}
                aria-pressed={filters.industry === industry}
                className={`min-h-10 rounded-full border px-3 text-sm transition-colors ${filters.industry === industry ? "border-emerald-900 bg-emerald-900 text-white" : "border-line bg-white text-ink-soft hover:border-emerald-700 hover:text-emerald-900"}`}
                onClick={() =>
                  updateFilters({
                    industry:
                      filters.industry === industry ? undefined : industry,
                  })
                }
                type="button"
              >
                {industry}
              </button>
            ),
          )}
        </div>
        <div className="flex flex-col justify-between gap-5 border-b border-line pb-6 sm:flex-row sm:items-end">
          <div>
            <h2 className="font-display text-4xl leading-[1.08] tracking-[-0.025em] text-navy-950 sm:text-5xl">
              {filters.q
                ? `Results for “${filters.q}”`
                : filters.availability === "sold"
                  ? "Sold businesses"
                  : "Explore businesses"}
            </h2>
            <p aria-live="polite" className="mt-2 text-sm text-ink-soft">
              {listingsQuery.isFetching && listingsQuery.data
                ? "Updating listings…"
                : page
                  ? `${page.total.toLocaleString()} ${page.total === 1 ? "business" : "businesses"}`
                  : "Browse marketplace listings"}
            </p>
            {activeCriteria ? (
              <div
                className="mt-3 flex flex-wrap gap-2"
                aria-label="Active search criteria"
              >
                {filters.industry ? (
                  <span className="rounded-full border border-line bg-white px-3 py-1 text-xs text-ink-soft">
                    Industry · {filters.industry}
                  </span>
                ) : null}
                {filters.location ? (
                  <span className="rounded-full border border-line bg-white px-3 py-1 text-xs text-ink-soft">
                    Location · {filters.location}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-3">
            <label className="flex flex-col gap-1 text-xs font-medium text-ink-soft">
              Availability
              <span className="relative">
                <select
                  className="h-11 appearance-none rounded-lg border border-line bg-white py-2 pl-3.5 pr-9 text-sm font-semibold text-navy-950 focus-visible:outline-2 focus-visible:outline-emerald-700"
                  value={filters.availability ?? "available"}
                  onChange={(event) =>
                    updateFilters({
                      availability: event.target
                        .value as MarketplaceFilters["availability"],
                    })
                  }
                >
                  <option value="available">Available Businesses</option>
                  <option value="sold">Sold Businesses</option>
                  <option value="all">All Businesses</option>
                </select>
                <ChevronDown
                  aria-hidden="true"
                  className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-soft"
                  size={15}
                />
              </span>
            </label>
            <label
              className="flex flex-col gap-1 text-xs font-medium text-ink-soft"
              htmlFor="sort-listings"
            >
              Sort
              <span className="relative">
                <select
                  className="h-11 appearance-none rounded-lg border border-line bg-white py-2 pl-3.5 pr-9 text-sm font-semibold text-navy-950 outline-none transition hover:border-emerald-300 focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10"
                  id="sort-listings"
                  onChange={(event) =>
                    updateFilters({
                      sort: event.target.value as MarketplaceFilters["sort"],
                    })
                  }
                  value={filters.sort}
                >
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                  <option value="price_asc">Asking price: low to high</option>
                  <option value="price_desc">Asking price: high to low</option>
                </select>
                <ChevronDown
                  aria-hidden="true"
                  className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint"
                  size={15}
                />
              </span>
            </label>
            {filters.sort.startsWith("price_") && (
              <p className="w-full text-xs text-ink-soft">
                Price sorting uses the amounts as listed in their original
                currencies.
              </p>
            )}
          </div>
        </div>

        {comparison.ids.length > 0 && (
          <aside
            aria-label="Comparison selection"
            className="sticky top-24 z-10 mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-white p-3 shadow-card"
          >
            <p role="status" className="text-sm font-semibold text-navy-950">
              {comparison.ids.length} of {comparisonLimit} selected
              {limitReached && ". Remove a selection to add another."}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={comparison.clear}>
                Clear all
              </Button>
              <Button asChild variant="accent" size="sm">
                <Link
                  to="/marketplace/compare"
                  state={{ marketplaceSearch: searchParams.toString() }}
                >
                  Compare businesses
                </Link>
              </Button>
            </div>
          </aside>
        )}
        {listingsQuery.isError && !listingsQuery.data ? (
          <div className="mt-8">
            <ErrorState
              error={listingsQuery.error}
              description="The business listings could not be loaded. Check your connection and try again."
              onRetry={() => void listingsQuery.refetch()}
              title="Marketplace unavailable"
            />
          </div>
        ) : null}
        {listingsQuery.isError && listingsQuery.data ? (
          <div className="mt-5">
            <ErrorState
              description="Showing the last results we loaded. Try again to refresh them."
              onRetry={() => void listingsQuery.refetch()}
              title="Couldn’t refresh listings"
            />
          </div>
        ) : null}
        {listingsQuery.isPending ? (
          <div
            aria-label="Loading business listings"
            className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
            role="status"
          >
            {Array.from({ length: 6 }, (_, index) => (
              <ListingCardSkeleton key={index} />
            ))}
          </div>
        ) : null}
        {listingsQuery.data?.listings.length ? (
          <div
            className={`mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 ${listingsQuery.isFetching ? "opacity-60 transition-opacity" : ""}`}
          >
            {listingsQuery.data.listings.map((listing) => (
              <ListingCard
                key={listing.id}
                listing={listing}
                comparison={{
                  selected: comparison.ids.includes(listing.id),
                  limitReached,
                  onToggle: () =>
                    comparison.ids.includes(listing.id)
                      ? comparison.remove(listing.id)
                      : comparison.add(listing.id),
                }}
              />
            ))}
          </div>
        ) : null}
        {listingsQuery.data && listingsQuery.data.listings.length === 0 ? (
          <Card className="mt-7 border-dashed border-emerald-200 bg-white px-6 py-14 text-center sm:py-16">
            <span className="mx-auto grid size-14 place-items-center rounded-full bg-emerald-50 text-emerald-800">
              <Building2 aria-hidden="true" size={23} />
            </span>
            <h3 className="mt-5 text-xl font-semibold tracking-tight text-navy-950">
              {activeCriteria
                ? "No businesses match your search"
                : filters.availability === "sold"
                  ? "No completed acquisitions yet"
                  : "New opportunities are on the way"}
            </h3>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-ink-soft">
              {activeCriteria
                ? "Clear a filter or search for a different business, industry, or location."
                : filters.availability === "sold"
                  ? "Completed acquisitions will appear here."
                  : "Check back for new listings or view all businesses."}
            </p>
            {activeCriteria ? (
              <Button
                className="mt-5"
                onClick={clearSearch}
                size="sm"
                variant="outline"
              >
                Clear search
              </Button>
            ) : filters.availability === "sold" ? (
              <Button
                className="mt-5"
                onClick={() => updateFilters({ availability: "available" })}
                variant="outline"
              >
                Browse available businesses
              </Button>
            ) : filters.availability !== "all" ? (
              <Button
                className="mt-5"
                onClick={() => updateFilters({ availability: "all" })}
                variant="outline"
              >
                Browse all businesses
              </Button>
            ) : null}
          </Card>
        ) : null}
        {page && page.totalPages > 1 ? (
          <nav
            aria-label="Marketplace pages"
            className="mt-9 flex flex-col items-center justify-between gap-4 border-t border-line pt-5 sm:flex-row"
          >
            <p className="text-sm text-ink-soft">
              Page{" "}
              <span className="font-semibold text-navy-950">{page.page}</span>{" "}
              of {page.totalPages}
            </p>
            <div className="flex items-center gap-2">
              <Button
                disabled={page.page <= 1 || listingsQuery.isFetching}
                onClick={() => updateFilters({ page: page.page - 1 }, false)}
                size="sm"
                variant="outline"
              >
                <ArrowLeft aria-hidden="true" size={15} /> Previous
              </Button>
              <Button
                disabled={
                  page.page >= page.totalPages || listingsQuery.isFetching
                }
                onClick={() => updateFilters({ page: page.page + 1 }, false)}
                size="sm"
                variant="outline"
              >
                Next <ArrowRight aria-hidden="true" size={15} />
              </Button>
            </div>
          </nav>
        ) : null}
      </section>
    </>
  );
}
