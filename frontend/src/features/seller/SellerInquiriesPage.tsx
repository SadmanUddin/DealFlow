import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { MessageSquareText, Search } from "lucide-react";
import { ErrorState } from "@/components/shared/ErrorState";
import {
  SectionCard,
  StatusBadge,
  WorkspaceEmpty,
  WorkspacePageHeader,
  WorkspaceSkeleton,
} from "@/components/shared/workspace/WorkspaceUI";
import { listInquiries, type Inquiry } from "./api";

export function SellerInquiriesPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | Inquiry["status"]>("all");
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ["seller", "inquiries", page, 20],
    queryFn: () => listInquiries(page, 20),
    staleTime: 45_000,
  });
  const inquiries = useMemo(
    () => query.data?.conversations ?? [],
    [query.data?.conversations],
  );
  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return inquiries.filter(
      (item) =>
        (status === "all" || item.status === status) &&
        (!needle ||
          `${item.listingTitle} ${item.id}`
            .toLocaleLowerCase()
            .includes(needle)),
    );
  }, [inquiries, search, status]);
  return (
    <>
      <WorkspacePageHeader
        description="Keep buyer conversations organized by business and inquiry status."
        eyebrow="Seller workspace · Buyer interest"
        title="Inquiries"
      />
      {query.isPending ? <WorkspaceSkeleton rows={3} /> : null}
      {query.isError ? (
        <ErrorState
          error={query.error}
          description="Your inquiry list could not be loaded."
          onRetry={() => void query.refetch()}
          title="Inquiries unavailable"
        />
      ) : null}
      {query.data ? (
        <div className="space-y-5">
          <section
            aria-label="Inquiry totals"
            className="grid gap-3 sm:grid-cols-3"
          >
            {["pending", "in_review", "accepted"].map((key) => (
              <div
                className="rounded-xl border border-line bg-white p-4"
                key={key}
              >
                <p className="text-xs text-ink-soft">
                  {key.replace("_", " ")} on this page
                </p>
                <p className="mt-1 text-2xl font-semibold text-navy-950">
                  {inquiries.filter((item) => item.status === key).length}
                </p>
              </div>
            ))}
          </section>
          <SectionCard className="p-4 sm:p-5">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
              <label className="flex h-11 items-center gap-2 rounded-lg border border-line px-3 focus-within:border-emerald-600">
                <Search aria-hidden="true" size={15} />
                <input
                  aria-label="Search inquiries"
                  className="w-full bg-transparent text-sm outline-none"
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Business name or inquiry number"
                  value={search}
                />
              </label>
              <label className="flex h-11 items-center gap-2 rounded-lg border border-line px-3 text-xs font-semibold text-ink-soft">
                Status
                <select
                  aria-label="Filter inquiries by status"
                  className="min-w-0 flex-1 bg-transparent text-sm font-normal text-navy-950 outline-none"
                  onChange={(event) =>
                    setStatus(event.target.value as typeof status)
                  }
                  value={status}
                >
                  <option value="all">All statuses</option>
                  {[
                    "pending",
                    "in_review",
                    "accepted",
                    "rejected",
                    "closed",
                  ].map((value) => (
                    <option key={value} value={value}>
                      {value.replace("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </SectionCard>
          {filtered.length ? (
            <div className="space-y-3">
              {filtered.map((inquiry) => (
                <SectionCard className="p-0" key={inquiry.id}>
                  <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-mist text-emerald-900">
                        <MessageSquareText size={17} />
                      </span>
                      <div className="min-w-0">
                        <h2 className="truncate text-base font-semibold text-navy-950">
                          {inquiry.listingTitle}
                        </h2>
                        <p className="mt-1 text-xs text-ink-soft">
                          Inquiry #{inquiry.id} · Started{" "}
                          {new Intl.DateTimeFormat(undefined, {
                            dateStyle: "medium",
                          }).format(new Date(inquiry.createdAt))}
                        </p>
                        <p className="mt-1 text-xs text-ink-faint">
                          Buyer identity is not included in this API response.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-3 sm:justify-end">
                      <StatusBadge status={inquiry.status} />
                      <Link
                        className="rounded-lg border border-line px-3 py-2 text-xs font-semibold text-navy-950 hover:bg-mist"
                        to={`/seller/inquiries/${inquiry.id}`}
                      >
                        Open conversation
                      </Link>
                    </div>
                  </div>
                </SectionCard>
              ))}
            </div>
          ) : (
            <SectionCard>
              <WorkspaceEmpty
                description={
                  search || status !== "all"
                    ? "Try changing the search term or status filter."
                    : "Buyer inquiries about your published listings will appear here."
                }
                title={
                  search || status !== "all"
                    ? "No matching inquiries"
                    : "No buyer inquiries yet"
                }
              />
            </SectionCard>
          )}
          {query.data.pagination.totalPages > 1 ? (
            <div className="flex items-center justify-between rounded-xl border border-line bg-white px-4 py-3">
              <p className="text-xs text-ink-soft">
                Page {page} of {query.data.pagination.totalPages} ·{" "}
                {query.data.pagination.total} inquiries
              </p>
              <div className="flex gap-2">
                <button
                  className="rounded-lg border border-line px-3 py-2 text-xs font-semibold disabled:opacity-50"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  type="button"
                >
                  Previous
                </button>
                <button
                  className="rounded-lg border border-line px-3 py-2 text-xs font-semibold disabled:opacity-50"
                  disabled={page >= query.data.pagination.totalPages}
                  onClick={() =>
                    setPage((current) =>
                      Math.min(query.data.pagination.totalPages, current + 1),
                    )
                  }
                  type="button"
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
