import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { ErrorState } from "@/components/shared/ErrorState";
import { Button } from "@/components/ui/button";
import {
  SectionCard,
  WorkspaceEmpty,
  WorkspacePageHeader,
  WorkspaceSkeleton,
} from "@/components/shared/workspace/WorkspaceUI";
import { toApiError } from "@/lib/api-error";
import {
  deleteSavedSearch,
  listSavedSearches,
  savedSearchKey,
  updateSavedSearch,
  type SavedSearch,
} from "./api";
import { savedCriteria, savedSearchMarketplaceLink } from "./search-filters";

const date = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

export function BuyerSavedSearchesPage() {
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<SavedSearch | null>(null);
  const [notice, setNotice] = useState("");
  const client = useQueryClient();
  const query = useQuery({
    queryKey: [...savedSearchKey, "list", page],
    queryFn: () => listSavedSearches(page),
  });
  const refresh = () => client.invalidateQueries({ queryKey: savedSearchKey });
  const toggle = useMutation({
    mutationFn: (search: SavedSearch) =>
      updateSavedSearch(search.id, { alertsEnabled: !search.alertsEnabled }),
    onSuccess: async ({ savedSearch }) => {
      setNotice(
        savedSearch.alertsEnabled ? "Alerts enabled." : "Alerts disabled.",
      );
      await refresh();
    },
  });
  const remove = useMutation({
    mutationFn: deleteSavedSearch,
    onSuccess: async () => {
      setSelected(null);
      setNotice("Saved search deleted.");
      if (page > 1 && query.data?.savedSearches.length === 1) setPage(page - 1);
      await refresh();
    },
  });

  return (
    <>
      <WorkspacePageHeader
        eyebrow="Buyer workspace"
        title="Saved searches"
        description="Reopen your marketplace searches and manage alerts for newly published businesses."
        action={
          <Button asChild variant="accent">
            <Link to="/marketplace">Browse marketplace</Link>
          </Button>
        }
      />
      {notice && (
        <p role="status" className="mb-3 rounded-lg bg-emerald-50 p-3 text-sm">
          {notice}
        </p>
      )}
      {toggle.isError && (
        <p
          role="alert"
          className="mb-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-900"
        >
          {toApiError(toggle.error).message}
        </p>
      )}
      {query.isPending && <WorkspaceSkeleton rows={3} />}
      {query.isError && (
        <ErrorState
          title="Saved searches unavailable"
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      )}
      {query.data?.savedSearches.length === 0 && (
        <SectionCard>
          <WorkspaceEmpty
            title="No saved searches yet"
            description="Apply filters in the marketplace and choose Save this search."
            action={
              <Button asChild>
                <Link to="/marketplace">Find businesses</Link>
              </Button>
            }
          />
        </SectionCard>
      )}
      <div className="grid gap-3">
        {query.data?.savedSearches.map((search) => (
          <SectionCard key={search.id}>
            <h2 className="break-words text-lg font-semibold text-navy-950">
              {search.name}
            </h2>
            <p className="mt-1 text-sm text-ink-soft">
              {search.alertsEnabled ? "Alerts on" : "Alerts off"} · Email{" "}
              {search.frequency}
            </p>
            <p className="mt-1 text-xs text-ink-soft">
              Created{" "}
              <time dateTime={search.createdAt}>
                {date.format(new Date(search.createdAt))}
              </time>
              {" · "}Updated{" "}
              <time dateTime={search.updatedAt}>
                {date.format(new Date(search.updatedAt))}
              </time>
            </p>
            <dl className="mt-3 flex flex-wrap gap-2 text-sm">
              {[
                ...savedCriteria(search.filters),
                { label: "Availability", value: search.filters.availability },
                {
                  label: "Sort",
                  value: {
                    newest: "Newest first",
                    oldest: "Oldest first",
                    price_asc: "Price low to high",
                    price_desc: "Price high to low",
                  }[search.filters.sort],
                },
              ].map(({ label, value }) => (
                <div
                  key={label}
                  className="min-w-0 max-w-full rounded-lg bg-paper px-3 py-1.5"
                >
                  <dt className="text-xs text-ink-soft">{label}</dt>
                  <dd className="break-words">{value}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button asChild size="sm">
                <Link to={savedSearchMarketplaceLink(search.filters)}>
                  View matching businesses
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link
                  aria-label={`Edit ${search.name}`}
                  to={savedSearchMarketplaceLink(search.filters, search.id)}
                >
                  Edit
                </Link>
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={toggle.isPending}
                onClick={() => toggle.mutate(search)}
              >
                {search.alertsEnabled ? "Disable alerts" : "Enable alerts"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  remove.reset();
                  setSelected(search);
                }}
                aria-label={`Delete ${search.name}`}
              >
                Delete
              </Button>
            </div>
          </SectionCard>
        ))}
      </div>
      {query.data && (query.data.pagination.totalPages > 1 || page > 1) && (
        <nav
          aria-label="Saved search pages"
          className="mt-4 flex flex-wrap items-center gap-3"
        >
          <Button
            variant="outline"
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </Button>
          <span className="text-sm">Page {page}</span>
          <Button
            variant="outline"
            disabled={page >= query.data.pagination.totalPages}
            onClick={() => setPage(page + 1)}
          >
            Next
          </Button>
        </nav>
      )}
      {selected && (
        <ConfirmDialog
          title="Delete saved search?"
          description={`Delete “${selected.name}” and stop its alerts?`}
          confirmLabel="Delete saved search"
          busy={remove.isPending}
          error={remove.isError ? toApiError(remove.error).message : undefined}
          onCancel={() => setSelected(null)}
          onConfirm={() => remove.mutate(selected.id)}
        />
      )}
    </>
  );
}
