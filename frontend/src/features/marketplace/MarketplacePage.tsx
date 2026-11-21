import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  ChevronDown,
  MapPin,
  Search,
  Tag,
  X,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
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

function MarketplaceContent() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useMemo(
    () => parseMarketplaceFilters(searchParams.toString()),
    [searchParams],
  );
  const [draft, setDraft] = useState<SearchDraft>({
    q: filters.q ?? "",
    industry: filters.industry ?? "",
    location: filters.location ?? "",
    minPrice: filters.minPrice ?? "",
    maxPrice: filters.maxPrice ?? "",
    minRevenue: filters.minRevenue ?? "",
    maxRevenue: filters.maxRevenue ?? "",
    minEbitda: filters.minEbitda ?? "",
    maxEbitda: filters.maxEbitda ?? "",
  });
  const [filterError, setFilterError] = useState("");

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
    setDraft({
      q: "",
      industry: "",
      location: "",
      minPrice: "",
      maxPrice: "",
      minRevenue: "",
      maxRevenue: "",
      minEbitda: "",
      maxEbitda: "",
    });
    setSearchParams(
      serializeMarketplaceFilters({
        page: 1,
        limit: filters.limit,
        sort: "newest",
      }),
      { replace: true },
    );
  };

  const listingsQuery = useQuery({
    queryKey: ["marketplace", filters],
    queryFn: () => getPublicListings(filters),
    retry: retryQuery,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    placeholderData: (previousData) => previousData,
  });
  const page = listingsQuery.data?.pagination;
  const activeCriteria = hasCriteria(filters);

  return (
    <>
      <section className="relative overflow-hidden border-b border-line bg-[radial-gradient(ellipse_at_80%_30%,#d8eee1,transparent_36%),linear-gradient(115deg,#fff_0%,#f3f7f5_58%,#eaf2ed_100%)]">
        <div className="page-container relative py-12 sm:py-16 lg:py-[4.5rem]">
          <div className="grid items-end gap-9 lg:grid-cols-[minmax(0,1fr)_minmax(34rem,1.05fr)] lg:gap-14">
            <div className="max-w-2xl">
              <p className="eyebrow text-emerald-800">
                A marketplace for what’s next
              </p>
              <h1 className="mt-4 text-balance text-[2.65rem] font-semibold leading-[1.06] tracking-[-0.055em] text-navy-950 sm:text-5xl lg:text-[3.45rem]">
                Find your next business opportunity.
              </h1>
              <p className="mt-5 max-w-xl text-pretty text-base leading-7 text-ink-soft sm:text-lg sm:leading-8">
                Explore established businesses, discover acquisition
                opportunities and find the right next chapter for your
                investment.
              </p>
              <div className="mt-6 flex items-center gap-3 text-sm text-ink-soft">
                <span className="grid size-9 place-items-center rounded-full border border-emerald-900/10 bg-white/80 text-emerald-800">
                  <Building2 aria-hidden="true" size={17} />
                </span>
                Published opportunities, presented with clarity.
              </div>
              <fieldset className="mt-3 border-t border-line pt-3">
                <legend className="px-1 text-xs font-semibold text-navy-950">
                  Financial ranges{" "}
                  <span className="font-normal text-ink-faint">
                    (amounts are compared in each listing’s stated currency,
                    without conversion)
                  </span>
                </legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {(
                    [
                      ["minPrice", "maxPrice", "Asking price"],
                      ["minRevenue", "maxRevenue", "Annual revenue"],
                      ["minEbitda", "maxEbitda", "EBITDA"],
                    ] as const
                  ).map(([minKey, maxKey, label]) => (
                    <div
                      key={minKey}
                      className="rounded-lg border border-line px-3 py-2"
                    >
                      <p className="mb-1 text-[0.68rem] font-semibold text-ink-soft">
                        {label}
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="sr-only" htmlFor={minKey}>
                          Minimum {label}
                        </label>
                        <input
                          id={minKey}
                          aria-label={`Minimum ${label}`}
                          inputMode="decimal"
                          maxLength={19}
                          pattern="\d{1,16}(\.\d{1,2})?"
                          placeholder="Min"
                          value={draft[minKey]}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              [minKey]: event.target.value,
                            }))
                          }
                          className="h-9 min-w-0 rounded-md border border-line px-2 text-sm"
                        />
                        <label className="sr-only" htmlFor={maxKey}>
                          Maximum {label}
                        </label>
                        <input
                          id={maxKey}
                          aria-label={`Maximum ${label}`}
                          inputMode="decimal"
                          maxLength={19}
                          pattern="\d{1,16}(\.\d{1,2})?"
                          placeholder="Max"
                          value={draft[maxKey]}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              [maxKey]: event.target.value,
                            }))
                          }
                          className="h-9 min-w-0 rounded-md border border-line px-2 text-sm"
                        />
                      </div>
                      {draft[minKey] &&
                      draft[maxKey] &&
                      Number(draft[minKey]) > Number(draft[maxKey]) ? (
                        <p className="mt-1 text-[0.68rem] text-rose-800">
                          Minimum must not exceed maximum.
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-[0.68rem] text-ink-faint">
                  Use non-negative amounts with up to two decimal places.
                </p>
              </fieldset>
            </div>

            <form
              aria-label="Search marketplace"
              className="rounded-2xl border border-white bg-white p-3 shadow-[0_18px_55px_-38px_rgba(11,31,54,0.4)] ring-1 ring-navy-950/[0.04] sm:p-4"
              onSubmit={applySearch}
            >
              {filterError ? (
                <p role="alert" className="mb-2 text-xs text-rose-800">
                  {filterError}
                </p>
              ) : null}
              <div className="grid gap-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(9rem,0.85fr)_minmax(9rem,0.85fr)_auto]">
                <label className="group flex min-w-0 items-center gap-3 rounded-xl border border-transparent px-3.5 transition focus-within:border-emerald-700/20 focus-within:bg-emerald-50/40">
                  <Search
                    aria-hidden="true"
                    className="shrink-0 text-emerald-800"
                    size={19}
                  />
                  <span className="min-w-0 flex-1 py-2.5">
                    <span className="block text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                      Business
                    </span>
                    <input
                      aria-label="Search businesses"
                      className="mt-0.5 w-full min-w-0 bg-transparent text-sm font-medium text-navy-950 outline-none placeholder:font-normal placeholder:text-ink-faint"
                      maxLength={200}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          q: event.target.value,
                        }))
                      }
                      placeholder="Name or description"
                      type="search"
                      value={draft.q}
                    />
                  </span>
                </label>
                <label className="flex min-w-0 items-center gap-2.5 rounded-xl border border-transparent px-3.5 transition focus-within:border-emerald-700/20 focus-within:bg-emerald-50/40">
                  <Tag
                    aria-hidden="true"
                    className="shrink-0 text-emerald-800"
                    size={17}
                  />
                  <span className="min-w-0 flex-1 py-2.5">
                    <span className="block text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                      Industry
                    </span>
                    <input
                      aria-label="Industry / category"
                      className="mt-0.5 w-full min-w-0 bg-transparent text-sm font-medium text-navy-950 outline-none placeholder:font-normal placeholder:text-ink-faint"
                      maxLength={120}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          industry: event.target.value,
                        }))
                      }
                      placeholder="Any industry"
                      value={draft.industry}
                    />
                  </span>
                </label>
                <label className="flex min-w-0 items-center gap-2.5 rounded-xl border border-transparent px-3.5 transition focus-within:border-emerald-700/20 focus-within:bg-emerald-50/40">
                  <MapPin
                    aria-hidden="true"
                    className="shrink-0 text-emerald-800"
                    size={18}
                  />
                  <span className="min-w-0 flex-1 py-2.5">
                    <span className="block text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                      Location
                    </span>
                    <input
                      aria-label="Location"
                      className="mt-0.5 w-full min-w-0 bg-transparent text-sm font-medium text-navy-950 outline-none placeholder:font-normal placeholder:text-ink-faint"
                      maxLength={160}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          location: event.target.value,
                        }))
                      }
                      placeholder="Anywhere"
                      value={draft.location}
                    />
                  </span>
                </label>
                <Button
                  className="h-[3.65rem] rounded-xl px-5 lg:self-center"
                  size="lg"
                  type="submit"
                  variant="accent"
                >
                  <Search aria-hidden="true" size={17} /> Search
                </Button>
              </div>
              <div className="mt-2 flex items-center justify-between border-t border-line px-2 pt-3">
                <p className="text-xs text-ink-faint">
                  Search published businesses by name, industry or location.
                </p>
                {activeCriteria ? (
                  <button
                    className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-50"
                    onClick={clearSearch}
                    type="button"
                  >
                    <X aria-hidden="true" size={13} /> Clear
                  </button>
                ) : null}
              </div>
            </form>
          </div>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-24 -top-44 size-[26rem] rounded-full border border-emerald-950/[0.05]"
          />
        </div>
      </section>

      <section className="page-container py-10 sm:py-14">
        <div className="flex flex-col justify-between gap-5 border-b border-line pb-6 sm:flex-row sm:items-end">
          <div>
            <p className="eyebrow text-emerald-800">The marketplace</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-navy-950 sm:text-4xl">
              {filters.q
                ? `Results for “${filters.q}”`
                : "Explore opportunities"}
            </h2>
            <p aria-live="polite" className="mt-2 text-sm text-ink-soft">
              {listingsQuery.isFetching && listingsQuery.data
                ? "Updating opportunities…"
                : page
                  ? `${page.total.toLocaleString()} ${page.total === 1 ? "published business" : "published businesses"}`
                  : "Discover businesses available for acquisition"}
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
          <label
            className="flex items-center gap-2 text-sm font-medium text-ink-soft"
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
                <option value="price_asc">Price: low to high</option>
                <option value="price_desc">Price: high to low</option>
              </select>
              <ChevronDown
                aria-hidden="true"
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint"
                size={15}
              />
            </span>
          </label>
        </div>

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
              <ListingCard key={listing.id} listing={listing} />
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
                : "New opportunities are on the way"}
            </h3>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-ink-soft">
              {activeCriteria
                ? "Try a broader business, industry or location search to discover more published listings."
                : "There are no published listings to show right now. Check back soon for new opportunities."}
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

export function MarketplacePage() {
  const [searchParams] = useSearchParams();
  return <MarketplaceContent key={searchParams.toString()} />;
}
