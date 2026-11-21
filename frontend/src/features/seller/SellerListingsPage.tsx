import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { Archive, ArrowUpRight, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { ErrorState } from "@/components/shared/ErrorState";
import {
  SectionCard,
  StatusBadge,
  WorkspaceEmpty,
  WorkspacePageHeader,
  WorkspaceSkeleton,
} from "@/components/shared/workspace/WorkspaceUI";
import { formatListingMoney } from "@/features/marketplace/marketplace-format";
import { toApiError } from "@/lib/api-error";
import {
  archiveListing,
  deleteDraftListing,
  listMyListings,
  submitListing,
  type SellerListing,
} from "./api";

type ListingAction = {
  listing: SellerListing;
  kind: "archive" | "delete";
} | null;

export function SellerListingsPage() {
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [action, setAction] = useState<ListingAction>(null);
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const query = useQuery({
    queryKey: ["seller", "listings", page, 100],
    queryFn: () => listMyListings(page, 100),
    staleTime: 15_000,
  });
  const mutation = useMutation({
    mutationFn: async ({ listing, kind }: Exclude<ListingAction, null>) => {
      if (kind === "archive") return archiveListing(listing.id);
      return deleteDraftListing(listing.id);
    },
    onSuccess: async (_result, variables) => {
      setAction(null);
      setActionError("");
      setNotice(
        variables.kind === "archive"
          ? "Listing archived."
          : "Draft listing deleted.",
      );
      await client.invalidateQueries({ queryKey: ["seller", "listings"] });
    },
    onError: (error) => setActionError(toApiError(error).message),
  });
  const submitMutation = useMutation({
    mutationFn: submitListing,
    onSuccess: async () => {
      setNotice("Listing submitted for moderation.");
      setActionError("");
      await client.invalidateQueries({ queryKey: ["seller", "listings"] });
    },
    onError: (error) => setActionError(toApiError(error).message),
  });
  const listings = useMemo(
    () => query.data?.listings ?? [],
    [query.data?.listings],
  );
  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return listings.filter(
      (listing) =>
        !needle ||
        `${listing.title} ${listing.industry ?? ""} ${listing.location ?? ""} ${listing.status}`
          .toLocaleLowerCase()
          .includes(needle),
    );
  }, [listings, search]);
  const counts = useMemo(
    () => ({
      published: listings.filter((item) => item.status === "published").length,
      draft: listings.filter((item) => item.status === "draft").length,
      review: listings.filter((item) => item.status === "pending").length,
    }),
    [listings],
  );
  const totalPages = query.data?.pagination.totalPages ?? 1;

  return (
    <>
      <WorkspacePageHeader
        action={
          <Button asChild variant="accent">
            <Link to="/seller/listings/new">
              <Plus size={16} /> New listing
            </Link>
          </Button>
        }
        description="Create a clear, credible profile for each business and manage its publication lifecycle."
        eyebrow="Seller workspace · Portfolio"
        title="Your listings"
      />
      {notice ? (
        <p
          className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
          role="status"
        >
          {notice}
        </p>
      ) : null}
      {actionError ? (
        <p
          className="mb-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-900"
          role="alert"
        >
          {actionError}
        </p>
      ) : null}
      {query.isPending ? <WorkspaceSkeleton rows={3} /> : null}
      {query.isError ? (
        <ErrorState
          description="Your business listings could not be loaded."
          onRetry={() => void query.refetch()}
          title="Listings unavailable"
        />
      ) : null}
      {query.data ? (
        <div className="space-y-5">
          <section
            aria-label="Listing totals"
            className="grid gap-3 sm:grid-cols-3"
          >
            <Summary label="Published on this page" value={counts.published} />
            <Summary label="Drafts on this page" value={counts.draft} />
            <Summary label="Pending on this page" value={counts.review} />
          </section>
          <SectionCard className="p-4 sm:p-5">
            <label className="flex h-11 max-w-lg items-center gap-2.5 rounded-lg border border-line px-3 text-ink-soft focus-within:border-emerald-600 focus-within:ring-4 focus-within:ring-emerald-500/10">
              <Search aria-hidden="true" size={16} />
              <input
                aria-label="Search your listings"
                className="w-full bg-transparent text-sm outline-none"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Business name, industry, location"
                value={search}
              />
            </label>
          </SectionCard>
          {filtered.length ? (
            <div className="space-y-3">
              {filtered.map((listing) => (
                <ListingRow
                  key={listing.id}
                  listing={listing}
                  busy={mutation.isPending || submitMutation.isPending}
                  onSubmit={() => submitMutation.mutate(listing.id)}
                  onAction={(kind) => setAction({ listing, kind })}
                />
              ))}
              {query.data.pagination.totalPages > 1 ? (
                <div className="flex items-center justify-between rounded-xl border border-line bg-white px-4 py-3">
                  <p className="text-xs text-ink-soft">
                    Page {page} of {query.data.pagination.totalPages} ·{" "}
                    {query.data.pagination.total} listings
                  </p>
                  <div className="flex gap-2">
                    <Button
                      disabled={page <= 1}
                      onClick={() =>
                        setPage((current) => Math.max(1, current - 1))
                      }
                      size="sm"
                      variant="outline"
                    >
                      Previous
                    </Button>
                    <Button
                      disabled={page >= totalPages}
                      onClick={() =>
                        setPage((current) => Math.min(totalPages, current + 1))
                      }
                      size="sm"
                      variant="outline"
                    >
                      Next
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <SectionCard>
              <WorkspaceEmpty
                action={
                  <Button asChild variant="accent">
                    <Link to="/seller/listings/new">Create a listing</Link>
                  </Button>
                }
                description={
                  search
                    ? "Try a different name, industry, or location."
                    : "Start by adding the business you want to bring to market."
                }
                title={
                  search ? "No listings match your search" : "No listings yet"
                }
              />
            </SectionCard>
          )}
        </div>
      ) : null}
      {action ? (
        <ConfirmDialog
          confirmLabel={
            action?.kind === "archive" ? "Archive listing" : "Delete draft"
          }
          description={
            action?.kind === "archive"
              ? `Archive “${action.listing.title}”? It will no longer appear in public marketplace results.`
              : `Delete the draft “${action?.listing.title ?? ""}”? This cannot be undone.`
          }
          error={mutation.isError ? actionError : undefined}
          onCancel={() => setAction(null)}
          onConfirm={() => action && mutation.mutate(action)}
          busy={mutation.isPending}
          title={
            action?.kind === "archive"
              ? "Archive this listing?"
              : "Delete this draft?"
          }
        />
      ) : null}
    </>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-line bg-white px-4 py-3">
      <p className="text-xs font-medium text-ink-soft">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-navy-950">
        {value}
      </p>
    </div>
  );
}

function ListingRow({
  listing,
  busy,
  onSubmit,
  onAction,
}: {
  listing: SellerListing;
  busy: boolean;
  onSubmit: () => void;
  onAction: (kind: "archive" | "delete") => void;
}) {
  return (
    <SectionCard className="p-0">
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={listing.status} />
            <span className="text-xs text-ink-faint">
              Updated{" "}
              {new Intl.DateTimeFormat(undefined, {
                dateStyle: "medium",
              }).format(new Date(listing.updatedAt))}
            </span>
          </div>
          <h2 className="mt-2 truncate text-lg font-semibold text-navy-950">
            {listing.title}
          </h2>
          <p className="mt-1 line-clamp-2 text-sm leading-6 text-ink-soft">
            {listing.industry ?? "Industry not specified"} ·{" "}
            {listing.location ?? "Location not specified"}
          </p>
          <p className="mt-2 text-xs text-ink-faint">
            Asking price ·{" "}
            <span className="font-semibold text-navy-950">
              {formatListingMoney(listing.askingPrice, listing.currency)}
            </span>
          </p>
          {listing.rejectionReason ? (
            <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-900">
              <strong>Moderator feedback:</strong> {listing.rejectionReason}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          {listing.status === "draft" || listing.status === "rejected" ? (
            <Button
              disabled={busy}
              onClick={onSubmit}
              size="sm"
              variant="accent"
            >
              Submit for review <ArrowUpRight size={14} />
            </Button>
          ) : null}
          {listing.status === "draft" ||
          listing.status === "rejected" ||
          listing.status === "published" ? (
            <Button asChild size="sm" variant="outline">
              <Link to={`/seller/listings/${listing.id}/edit`}>Edit</Link>
            </Button>
          ) : null}
          {listing.status === "published" ? (
            <Button
              disabled={busy}
              onClick={() => onAction("archive")}
              size="sm"
              variant="outline"
            >
              <Archive size={14} /> Archive
            </Button>
          ) : null}
          {listing.status === "draft" ? (
            <Button
              aria-label={`Delete ${listing.title}`}
              disabled={busy}
              onClick={() => onAction("delete")}
              size="icon"
              variant="ghost"
            >
              <Trash2 size={16} />
            </Button>
          ) : null}
          {listing.status === "published" ? (
            <Button asChild size="sm" variant="ghost">
              <Link to={`/listings/${listing.id}`}>
                Preview <ArrowUpRight size={14} />
              </Link>
            </Button>
          ) : null}
        </div>
      </div>
    </SectionCard>
  );
}
