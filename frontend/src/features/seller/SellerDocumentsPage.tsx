import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { FileLock2, Search } from "lucide-react";
import { ErrorState } from "@/components/shared/ErrorState";
import {
  SectionCard,
  StatusBadge,
  WorkspaceEmpty,
  WorkspacePageHeader,
  WorkspaceSkeleton,
} from "@/components/shared/workspace/WorkspaceUI";
import { listInquiries } from "./api";

export function SellerDocumentsPage() {
  const [search, setSearch] = useState("");
  const query = useQuery({
    queryKey: ["seller", "inquiries", 1, 100],
    queryFn: () => listInquiries(1, 100),
    staleTime: 45_000,
  });
  const conversations = useMemo(
    () => query.data?.conversations ?? [],
    [query.data?.conversations],
  );
  const filtered = conversations.filter(
    (item) =>
      !search.trim() ||
      `${item.listingTitle} ${item.id}`
        .toLocaleLowerCase()
        .includes(search.trim().toLocaleLowerCase()),
  );
  return (
    <>
      <WorkspacePageHeader
        description="Open a buyer conversation to review and manage its private documents."
        eyebrow="Seller workspace · Private files"
        title="Documents"
      />
      {query.isPending ? <WorkspaceSkeleton rows={3} /> : null}
      {query.isError ? (
        <ErrorState
          error={query.error}
          description="Your conversations could not be loaded."
          onRetry={() => void query.refetch()}
          title="Documents unavailable"
        />
      ) : null}
      {query.data ? (
        <div className="space-y-4">
          <p className="rounded-xl border border-emerald-900/10 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-950">
            Choose a buyer conversation to upload or manage shared files. File
            access stays tied to the conversation, and downloads do not expose
            storage URLs.
          </p>
          <SectionCard className="p-4">
            <label className="flex h-11 items-center gap-2 rounded-lg border border-line px-3">
              <Search size={15} />
              <input
                aria-label="Search conversations with documents"
                className="w-full bg-transparent text-sm outline-none"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by business or conversation"
                value={search}
              />
            </label>
          </SectionCard>
          {filtered.length ? (
            <div className="grid gap-3 md:grid-cols-2">
              {filtered.map((item) => (
                <SectionCard key={item.id}>
                  <div className="flex items-start justify-between gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-mist text-emerald-900">
                      <FileLock2 size={18} />
                    </span>
                    <StatusBadge status={item.status} />
                  </div>
                  <h2 className="mt-4 text-base font-semibold text-navy-950">
                    {item.listingTitle}
                  </h2>
                  <p className="mt-1 text-xs text-ink-soft">
                    Buyer conversation #{item.id}
                  </p>
                  <Link
                    className="mt-4 inline-flex rounded-lg border border-line px-3 py-2 text-xs font-semibold text-navy-950 hover:bg-mist"
                    to={`/seller/inquiries/${item.id}`}
                  >
                    Open private files
                  </Link>
                </SectionCard>
              ))}
            </div>
          ) : (
            <SectionCard>
              <WorkspaceEmpty
                description={
                  search
                    ? "Try a different search."
                    : "Private files are available inside an active buyer conversation."
                }
                title={
                  search ? "No matching conversations" : "No conversations yet"
                }
              />
            </SectionCard>
          )}
          {query.data.pagination.total > conversations.length ? (
            <p className="text-xs text-ink-faint">
              Showing your latest 100 conversations.
            </p>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
