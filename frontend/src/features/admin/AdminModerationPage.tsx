import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  History,
  Search,
  ShieldAlert,
  X,
} from "lucide-react";
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
import { toApiError } from "@/lib/api-error";
import {
  changeAdminListingAvailability,
  getAdminListingHistory,
  listAdminListings,
  moderateAdminListing,
  type AdminListing,
  type AdminListingStatus,
} from "./api";

type ModerationAction = {
  listing: AdminListing;
  kind: "approve" | "reject" | "suspend" | "restore";
};
const statuses: Array<AdminListingStatus | "all"> = [
  "pending",
  "all",
  "draft",
  "published",
  "rejected",
  "suspended",
  "archived",
];

export function AdminModerationPage() {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get("page")) || 1);
  const statusValue = params.get("status") || "pending";
  const status = statuses.includes(statusValue as (typeof statuses)[number])
    ? (statusValue as (typeof statuses)[number])
    : "pending";
  const q = params.get("q") ?? "";
  const [input, setInput] = useState(q);
  const [reason, setReason] = useState("");
  const [selected, setSelected] = useState<ModerationAction | null>(null);
  const [historyId, setHistoryId] = useState<number | null>(null);
  const [failure, setFailure] = useState("");
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["admin", "listings", page, 20, status, q],
    queryFn: () => listAdminListings({ page, limit: 20, status, q }),
    placeholderData: (previous) => previous,
  });
  const history = useQuery({
    queryKey: ["admin", "listing-history", historyId],
    queryFn: () => getAdminListingHistory(historyId!),
    enabled: historyId !== null,
  });
  const mutation = useMutation({
    mutationFn: (action: ModerationAction) => {
      const cleanReason = reason.trim();
      if (action.kind === "approve" || action.kind === "reject")
        return moderateAdminListing(action.listing.id, {
          action: action.kind,
          ...(action.kind === "reject" ? { rejectionReason: cleanReason } : {}),
        });
      return changeAdminListingAvailability(action.listing.id, {
        action: action.kind,
        reason: cleanReason,
      });
    },
    onSuccess: async () => {
      setSelected(null);
      setReason("");
      setFailure("");
      await client.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (error) => setFailure(toApiError(error).message),
  });
  const updateFilters = (values: {
    status?: string;
    q?: string;
    page?: number;
  }) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(values)) {
      if (
        !value ||
        value === "all" ||
        (key === "status" && value === "pending")
      )
        next.delete(key);
      else next.set(key, String(value));
    }
    if (values.status !== undefined || values.q !== undefined)
      next.delete("page");
    setParams(next);
  };
  const needsReason = selected?.kind !== "approve";
  const labels = {
    approve: "Approve listing?",
    reject: "Reject listing?",
    suspend: "Suspend published listing?",
    restore: "Restore listing?",
  };
  const descriptions = {
    approve:
      "This listing will be published and become available in the public marketplace.",
    reject: `The seller will see the rejection reason: ${reason.trim()}`,
    suspend: `The published listing will become unavailable to buyers. Reason: ${reason.trim()}`,
    restore: `The listing will return to published status. Reason: ${reason.trim()}`,
  };

  return (
    <>
      <WorkspacePageHeader
        description="Review pending submissions and manage availability for listings already on the marketplace."
        eyebrow="Platform operations · Listings"
        title="Listing moderation"
      />
      <SectionCard className="mb-5">
        <form
          className="grid gap-3 sm:grid-cols-[minmax(14rem,1fr)_12rem_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            updateFilters({ q: input.trim() });
          }}
        >
          <label className="relative">
            <span className="sr-only">Search listings</span>
            <Search
              aria-hidden="true"
              className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"
              size={16}
            />
            <input
              className="h-10 w-full rounded-lg border border-line pl-9 pr-3 text-sm outline-none focus:border-emerald-700 focus:ring-4 focus:ring-emerald-500/10"
              onChange={(event) => setInput(event.target.value)}
              placeholder="Business name or description"
              value={input}
            />
          </label>
          <label>
            <span className="sr-only">Filter by listing status</span>
            <select
              aria-label="Filter by listing status"
              className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm"
              onChange={(event) =>
                updateFilters({ status: event.target.value })
              }
              value={status}
            >
              <option value="pending">Pending review</option>
              <option value="all">All statuses</option>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="rejected">Rejected</option>
              <option value="suspended">Suspended</option>
              <option value="archived">Archived</option>
            </select>
          </label>
          <Button type="submit">
            <Search aria-hidden="true" size={15} /> Search
          </Button>
        </form>
      </SectionCard>
      {query.isPending ? <WorkspaceSkeleton rows={3} /> : null}
      {query.isError ? (
        <ErrorState
          error={query.error}
          description="The listing queue could not be loaded."
          onRetry={() => void query.refetch()}
          title="Moderation queue unavailable"
        />
      ) : null}
      {query.data ? (
        <div className="space-y-3">
          <p className="px-1 text-xs text-ink-soft">
            {query.data.pagination.total} matching listings · page {page} of{" "}
            {Math.max(1, query.data.pagination.totalPages)}
          </p>
          {query.data.listings.length ? (
            query.data.listings.map((listing) => (
              <SectionCard className="p-0" key={listing.id}>
                <article className="p-5 sm:p-6">
                  <header className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="break-words text-base font-semibold text-navy-950">
                          {listing.title}
                        </h2>
                        <StatusBadge status={listing.status} />
                      </div>
                      <p className="mt-1.5 text-xs text-ink-soft">
                        Listing #{listing.id} · seller #{listing.sellerId} ·
                        submitted{" "}
                        {new Intl.DateTimeFormat(undefined, {
                          dateStyle: "medium",
                        }).format(new Date(listing.createdAt))}
                      </p>
                    </div>
                    <Link
                      className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-800 hover:text-emerald-950"
                      to={`/listings/${listing.id}`}
                    >
                      <ExternalLink aria-hidden="true" size={14} /> Open public
                      view
                    </Link>
                  </header>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <Info
                      label="Industry"
                      value={listing.industry ?? "Not specified"}
                    />
                    <Info
                      label="Location"
                      value={listing.location ?? "Not specified"}
                    />
                  </div>
                  <p className="mt-4 whitespace-pre-line text-sm leading-6 text-ink-soft">
                    {listing.description}
                  </p>
                  {listing.moderationReason ? (
                    <p className="mt-4 rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-950">
                      <strong>Existing moderation note:</strong>{" "}
                      {listing.moderationReason}
                    </p>
                  ) : null}
                  <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-4">
                    {listing.status === "pending" ? (
                      <>
                        <Button
                          disabled={mutation.isPending}
                          onClick={() => {
                            setFailure("");
                            setReason("");
                            setSelected({ listing, kind: "approve" });
                          }}
                          size="sm"
                          variant="accent"
                        >
                          <Check aria-hidden="true" size={14} /> Approve
                        </Button>
                        <Button
                          disabled={mutation.isPending}
                          onClick={() => {
                            setFailure("");
                            setReason("");
                            setSelected({ listing, kind: "reject" });
                          }}
                          size="sm"
                          variant="outline"
                        >
                          <X aria-hidden="true" size={14} /> Reject
                        </Button>
                      </>
                    ) : null}
                    {listing.status === "published" ? (
                      <Button
                        disabled={mutation.isPending}
                        onClick={() => {
                          setFailure("");
                          setReason("");
                          setSelected({ listing, kind: "suspend" });
                        }}
                        size="sm"
                        variant="outline"
                      >
                        <ShieldAlert aria-hidden="true" size={14} /> Suspend
                        listing
                      </Button>
                    ) : null}
                    {listing.status === "suspended" ? (
                      <Button
                        disabled={mutation.isPending}
                        onClick={() => {
                          setFailure("");
                          setReason("");
                          setSelected({ listing, kind: "restore" });
                        }}
                        size="sm"
                        variant="outline"
                      >
                        <Check aria-hidden="true" size={14} /> Restore listing
                      </Button>
                    ) : null}
                    <Button
                      aria-expanded={historyId === listing.id}
                      onClick={() =>
                        setHistoryId(
                          historyId === listing.id ? null : listing.id,
                        )
                      }
                      size="sm"
                      variant="ghost"
                    >
                      <History aria-hidden="true" size={14} />{" "}
                      {historyId === listing.id
                        ? "Hide history"
                        : "Moderation history"}
                    </Button>
                  </div>
                  {historyId === listing.id ? (
                    <HistoryPanel
                      error={history.isError}
                      loading={history.isPending}
                      logs={history.data?.auditLogs ?? []}
                      retry={() => void history.refetch()}
                    />
                  ) : null}
                </article>
              </SectionCard>
            ))
          ) : (
            <SectionCard>
              <WorkspaceEmpty
                title="No listings in this view"
                description={
                  status === "pending"
                    ? "There are no listings currently awaiting moderation."
                    : "Try a different status or search term."
                }
              />
            </SectionCard>
          )}
          {query.data.pagination.totalPages > 1 ? (
            <div className="flex justify-between">
              <Button
                disabled={page <= 1 || query.isFetching}
                onClick={() => updateFilters({ page: page - 1 })}
                size="sm"
                variant="outline"
              >
                <ChevronLeft size={15} /> Previous
              </Button>
              <Button
                disabled={
                  page >= query.data.pagination.totalPages || query.isFetching
                }
                onClick={() => updateFilters({ page: page + 1 })}
                size="sm"
                variant="outline"
              >
                Next <ChevronRight size={15} />
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
      {selected ? (
        <ConfirmDialog
          busy={mutation.isPending}
          busyLabel="Saving decision…"
          confirmDisabled={needsReason && reason.trim().length < 3}
          confirmLabel={
            selected.kind === "approve"
              ? "Approve listing"
              : selected.kind === "reject"
                ? "Reject listing"
                : selected.kind === "suspend"
                  ? "Suspend listing"
                  : "Restore listing"
          }
          description={`${descriptions[selected.kind]} This action will be recorded in the audit log.`}
          error={failure}
          onCancel={() => {
            if (!mutation.isPending) setSelected(null);
          }}
          onConfirm={() => mutation.mutate(selected)}
          title={labels[selected.kind]}
        >
          {needsReason ? (
            <label className="block text-xs font-semibold text-navy-950">
              Reason for audit record
              <textarea
                aria-label="Reason for administrative action"
                className="mt-2 min-h-20 w-full rounded-lg border border-line px-3 py-2 text-sm font-normal outline-none focus:border-emerald-700 focus:ring-4 focus:ring-emerald-500/10"
                maxLength={2000}
                onChange={(event) => setReason(event.target.value)}
                value={reason}
              />
            </label>
          ) : null}
        </ConfirmDialog>
      ) : null}
    </>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-mist/70 px-3 py-2">
      <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-ink-faint">
        {label}
      </p>
      <p className="mt-1 text-xs font-medium text-navy-950">{value}</p>
    </div>
  );
}

function HistoryPanel({
  loading,
  error,
  logs,
  retry,
}: {
  loading: boolean;
  error: boolean;
  logs: Array<{
    id: number;
    action: string;
    reason: string | null;
    createdAt: string | Date;
    actorId: number | null;
  }>;
  retry: () => void;
}) {
  if (loading)
    return (
      <div
        aria-label="Loading moderation history"
        className="mt-4 h-16 animate-pulse rounded-lg bg-mist"
        role="status"
      />
    );
  if (error)
    return (
      <div className="mt-4 flex items-center justify-between rounded-lg bg-rose-50 p-3 text-xs text-rose-900">
        History could not be loaded.
        <button
          className="font-semibold underline"
          onClick={retry}
          type="button"
        >
          Retry
        </button>
      </div>
    );
  return (
    <div className="mt-4 rounded-lg border border-line bg-[#FBFCFB] p-4">
      <h3 className="text-xs font-semibold text-navy-950">
        Moderation history
      </h3>
      {logs.length ? (
        <ol className="mt-3 space-y-3">
          {logs.map((entry) => (
            <li className="border-l-2 border-emerald-600 pl-3" key={entry.id}>
              <p className="text-xs font-semibold capitalize text-navy-950">
                {entry.action.replaceAll(".", " ")}
              </p>
              <p className="mt-1 text-[0.68rem] text-ink-soft">
                {new Intl.DateTimeFormat(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(entry.createdAt))}{" "}
                · admin #{entry.actorId ?? "system"}
              </p>
              {entry.reason ? (
                <p className="mt-1 text-xs leading-5 text-ink-soft">
                  {entry.reason}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-2 text-xs text-ink-soft">
          No moderation history has been recorded.
        </p>
      )}
    </div>
  );
}
