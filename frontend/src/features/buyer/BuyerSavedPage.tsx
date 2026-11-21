import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, Search, X } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/shared/ErrorState";
import { ListingCard } from "@/features/marketplace/ListingCard";
import type { PublicListing } from "@/features/marketplace/marketplace-api";
import {
  WorkspaceEmpty,
  WorkspacePageHeader,
} from "@/components/shared/workspace/WorkspaceUI";
import { listFavorites, removeFavorite } from "./api";

type SortMode = "recent" | "title";

function toPublicListing(
  favorite: Awaited<ReturnType<typeof listFavorites>>["favorites"][number],
): PublicListing {
  return {
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
  };
}

export function BuyerSavedPage() {
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [industry, setIndustry] = useState("");
  const [sort, setSort] = useState<SortMode>("recent");
  const [notice, setNotice] = useState("");
  const query = useQuery({
    queryKey: ["buyer", "favorites", page, 100],
    queryFn: () => listFavorites(page, 100),
    staleTime: 45_000,
  });
  const removeMutation = useMutation({
    mutationFn: (listingId: number) => removeFavorite(listingId),
    onSuccess: async () => {
      setNotice("Business removed from your saved list.");
      await Promise.all([
        client.invalidateQueries({ queryKey: ["buyer", "favorites"] }),
        client.invalidateQueries({ queryKey: ["buyer", "overview"] }),
      ]);
    },
  });
  const records = useMemo(
    () => query.data?.favorites ?? [],
    [query.data?.favorites],
  );
  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    const sector = industry.trim().toLocaleLowerCase();
    const matches = records.filter(
      (item) =>
        (!needle ||
          `${item.title} ${item.description} ${item.location ?? ""} ${item.industry ?? ""}`
            .toLocaleLowerCase()
            .includes(needle)) &&
        (!sector || item.industry?.toLocaleLowerCase().includes(sector)),
    );
    return [...matches].sort((a, b) =>
      sort === "title"
        ? a.title.localeCompare(b.title)
        : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [industry, records, search, sort]);

  return (
    <>
      <WorkspacePageHeader
        description="A working shortlist of published businesses you want to evaluate further."
        eyebrow="Buyer workspace · Opportunities"
        title="Saved businesses"
      />
      {notice ? (
        <p
          className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
          role="status"
        >
          {notice}
        </p>
      ) : null}
      {removeMutation.isError ? (
        <p
          className="mb-5 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-900"
          role="alert"
        >
          The business could not be removed. Refresh and try again.
        </p>
      ) : null}

      <div className="mb-5 grid gap-3 rounded-2xl border border-line bg-white p-3 shadow-none sm:grid-cols-[minmax(0,1fr)_minmax(11rem,0.7fr)_auto] sm:items-center">
        <label className="flex h-11 items-center gap-2.5 rounded-lg border border-line px-3 text-ink-soft focus-within:border-emerald-600 focus-within:ring-4 focus-within:ring-emerald-500/10">
          <Search aria-hidden="true" size={16} />
          <input
            aria-label="Search saved businesses"
            className="w-full bg-transparent text-sm text-navy-950 outline-none placeholder:text-ink-faint"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Name, description, or location"
            value={search}
          />
        </label>
        <label className="flex h-11 items-center gap-2 rounded-lg border border-line px-3 text-xs font-semibold text-ink-soft focus-within:border-emerald-600">
          Industry
          <input
            aria-label="Filter saved businesses by industry"
            className="min-w-0 flex-1 bg-transparent text-sm font-normal text-navy-950 outline-none placeholder:text-ink-faint"
            onChange={(event) => setIndustry(event.target.value)}
            placeholder="Any industry"
            value={industry}
          />
        </label>
        <label className="flex items-center gap-2 px-2 text-xs font-semibold text-ink-soft">
          Sort
          <select
            aria-label="Sort saved businesses"
            className="h-10 rounded-lg border border-line bg-white px-2.5 text-sm text-navy-950 outline-none focus:border-emerald-600"
            onChange={(event) => setSort(event.target.value as SortMode)}
            value={sort}
          >
            <option value="recent">Recently saved</option>
            <option value="title">Business name</option>
          </select>
        </label>
      </div>

      {query.isPending ? (
        <div
          aria-label="Loading saved businesses"
          className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
          role="status"
        >
          {Array.from({ length: 6 }, (_, index) => (
            <div
              className="h-[22rem] animate-pulse rounded-2xl bg-mist"
              key={index}
            />
          ))}
        </div>
      ) : null}
      {query.isError ? (
        <ErrorState
          error={query.error}
          description="Your saved businesses could not be loaded. Your list has not been changed."
          onRetry={() => void query.refetch()}
          title="Saved businesses unavailable"
        />
      ) : null}
      {query.data && filtered.length ? (
        <>
          <p className="mb-4 text-xs text-ink-soft" aria-live="polite">
            Showing {filtered.length} of{" "}
            {query.data.pagination.total.toLocaleString()} currently published
            saved businesses
            {query.data.pagination.total > records.length
              ? " · Search and sort apply to this page"
              : ""}
            .
          </p>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((favorite) => (
              <div className="relative" key={favorite.id}>
                <ListingCard listing={toPublicListing(favorite)} />
                <Button
                  aria-label={`Remove ${favorite.title} from saved businesses`}
                  className="absolute right-3 top-3 z-10 border-white bg-white/95 shadow-sm"
                  disabled={removeMutation.isPending}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    removeMutation.mutate(favorite.listingId);
                  }}
                  size="icon"
                  variant="outline"
                >
                  <X aria-hidden="true" size={16} />
                </Button>
              </div>
            ))}
          </div>
          {query.data.pagination.totalPages > 1 ? (
            <nav
              aria-label="Saved businesses pages"
              className="mt-7 flex items-center justify-between border-t border-line pt-4"
            >
              <span className="text-xs text-ink-soft">
                Page {page} of {query.data.pagination.totalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  disabled={page <= 1}
                  onClick={() => setPage((value) => value - 1)}
                  size="sm"
                  variant="outline"
                >
                  Previous
                </Button>
                <Button
                  disabled={page >= query.data.pagination.totalPages}
                  onClick={() => setPage((value) => value + 1)}
                  size="sm"
                  variant="outline"
                >
                  Next
                </Button>
              </div>
            </nav>
          ) : null}
        </>
      ) : null}
      {query.data && !filtered.length ? (
        <div className="rounded-2xl border border-line bg-white p-5">
          {records.length ? (
            <WorkspaceEmpty
              action={
                <Button
                  onClick={() => {
                    setSearch("");
                    setIndustry("");
                  }}
                  size="sm"
                  variant="outline"
                >
                  <X aria-hidden="true" size={14} /> Clear search
                </Button>
              }
              description="Try another business name, industry, description, or location."
              title="No saved businesses match"
            />
          ) : (
            <WorkspaceEmpty
              action={
                <Button asChild size="sm" variant="accent">
                  <Link to="/marketplace">Browse businesses</Link>
                </Button>
              }
              description="Save a published opportunity from its listing page to keep it on your shortlist."
              title="Your shortlist is empty"
            />
          )}
        </div>
      ) : null}
      <p className="mt-5 flex items-start gap-2 text-xs leading-5 text-ink-faint">
        <Bookmark aria-hidden="true" className="mt-0.5 shrink-0" size={14} />
        The favorites endpoint returns published listings only. If a listing
        becomes unavailable, the backend omits it from this list.
      </p>
    </>
  );
}
