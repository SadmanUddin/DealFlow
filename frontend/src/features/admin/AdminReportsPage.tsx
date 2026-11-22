import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router";
import { ChevronLeft, ChevronRight, Flag, Search } from "lucide-react";
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
  listAdminReports,
  reportCategories,
  updateAdminReport,
  type AdminReport,
  type AdminReportStatus,
} from "./api";

type ActionStatus = Exclude<AdminReportStatus, "pending">;
const statusOptions: Array<AdminReportStatus | "all"> = [
  "all",
  "pending",
  "under_review",
  "resolved",
  "dismissed",
];
const categoryLabel = (value: string) => value.replaceAll("_", " ");

export function AdminReportsPage() {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get("page")) || 1);
  const q = params.get("q") ?? "";
  const status = statusOptions.includes(
    params.get("status") as (typeof statusOptions)[number],
  )
    ? (params.get("status") as (typeof statusOptions)[number])
    : "all";
  const category = (reportCategories as readonly string[]).includes(
    params.get("category") ?? "",
  )
    ? (params.get("category") as (typeof reportCategories)[number])
    : "all";
  const [input, setInput] = useState(q);
  const [selected, setSelected] = useState<{
    report: AdminReport;
    status: ActionStatus;
  } | null>(null);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [failure, setFailure] = useState("");
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["admin", "reports", page, 20, q, status, category],
    queryFn: () => listAdminReports({ page, limit: 20, q, status, category }),
    placeholderData: (previous) => previous,
  });
  const mutation = useMutation({
    mutationFn: ({
      report,
      nextStatus,
    }: {
      report: AdminReport;
      nextStatus: ActionStatus;
    }) =>
      updateAdminReport(report.id, {
        status: nextStatus,
        reason: reason.trim(),
        ...(notes.trim() ? { moderatorNotes: notes.trim() } : {}),
      }),
    onSuccess: async () => {
      setSelected(null);
      setReason("");
      setNotes("");
      setFailure("");
      await client.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (error) => setFailure(toApiError(error).message),
  });
  const filter = (values: {
    q?: string;
    status?: string;
    category?: string;
    page?: number;
  }) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(values)) {
      if (!value || value === "all") next.delete(key);
      else next.set(key, String(value));
    }
    if (
      values.q !== undefined ||
      values.status !== undefined ||
      values.category !== undefined
    )
      next.delete("page");
    setParams(next);
  };
  const showAction = (report: AdminReport, nextStatus: ActionStatus) => {
    setFailure("");
    setReason("");
    setNotes(report.moderatorNotes ?? "");
    setSelected({ report, status: nextStatus });
  };

  return (
    <>
      <WorkspacePageHeader
        description="Review reports submitted by marketplace participants and record each resolution with an audit reason."
        eyebrow="Platform operations · Trust & safety"
        title="Reports"
      />
      <SectionCard className="mb-5">
        <form
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_10rem_12rem_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            filter({ q: input.trim() });
          }}
        >
          <label className="relative">
            <span className="sr-only">Search report descriptions</span>
            <Search
              aria-hidden="true"
              className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"
              size={16}
            />
            <input
              className="h-10 w-full rounded-lg border border-line pl-9 pr-3 text-sm outline-none focus:border-emerald-700 focus:ring-4 focus:ring-emerald-500/10"
              onChange={(event) => setInput(event.target.value)}
              placeholder="Search report details"
              value={input}
            />
          </label>
          <label>
            <span className="sr-only">Filter by report status</span>
            <select
              aria-label="Filter by report status"
              className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm"
              onChange={(event) => filter({ status: event.target.value })}
              value={status}
            >
              <option value="all">All statuses</option>
              {statusOptions.slice(1).map((item) => (
                <option key={item} value={item}>
                  {categoryLabel(item)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Filter by report category</span>
            <select
              aria-label="Filter by report category"
              className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm"
              onChange={(event) => filter({ category: event.target.value })}
              value={category}
            >
              <option value="all">All categories</option>
              {reportCategories.map((item) => (
                <option key={item} value={item}>
                  {categoryLabel(item)}
                </option>
              ))}
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
          description="Reports could not be loaded."
          onRetry={() => void query.refetch()}
          title="Reports unavailable"
        />
      ) : null}
      {query.data ? (
        <div className="space-y-3">
          <p className="px-1 text-xs text-ink-soft">
            {query.data.pagination.total} reports · page {page} of{" "}
            {Math.max(1, query.data.pagination.totalPages)}
          </p>
          {query.data.reports.length ? (
            query.data.reports.map((report) => (
              <SectionCard className="p-0" key={report.id}>
                <article className="p-5 sm:p-6">
                  <header className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-amber-50 text-amber-900">
                        <Flag aria-hidden="true" size={16} />
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-sm font-semibold capitalize text-navy-950">
                            {categoryLabel(report.category)}
                          </h2>
                          <StatusBadge status={report.status} />
                        </div>
                        <p className="mt-1 text-xs text-ink-soft">
                          Report #{report.id} · filed by user #
                          {report.reporterId} ·{" "}
                          {new Intl.DateTimeFormat(undefined, {
                            dateStyle: "medium",
                            timeStyle: "short",
                          }).format(new Date(report.createdAt))}
                        </p>
                      </div>
                    </div>
                    <TargetLink report={report} />
                  </header>
                  <p className="mt-4 break-words whitespace-pre-wrap rounded-xl border border-line bg-paper p-4 text-sm leading-6 text-navy-900">
                    {report.description}
                  </p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {report.assignedTo ? (
                      <Meta
                        label="Assigned administrator"
                        value={`User #${report.assignedTo}`}
                      />
                    ) : null}
                    {report.resolutionReason ? (
                      <Meta
                        label="Resolution reason"
                        value={report.resolutionReason}
                      />
                    ) : null}
                  </div>
                  {report.moderatorNotes ? (
                    <p className="mt-3 rounded-lg bg-mist p-3 text-xs leading-5 text-ink-soft">
                      <strong className="text-navy-950">
                        Moderator notes:
                      </strong>{" "}
                      {report.moderatorNotes}
                    </p>
                  ) : null}
                  {!(["resolved", "dismissed"] as AdminReportStatus[]).includes(
                    report.status,
                  ) ? (
                    <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
                      {report.status === "pending" ? (
                        <Button
                          disabled={mutation.isPending}
                          onClick={() => showAction(report, "under_review")}
                          size="sm"
                          variant="outline"
                        >
                          Assign to me · review
                        </Button>
                      ) : null}
                      <Button
                        disabled={mutation.isPending}
                        onClick={() => showAction(report, "resolved")}
                        size="sm"
                        variant="accent"
                      >
                        Resolve report
                      </Button>
                      <Button
                        disabled={mutation.isPending}
                        onClick={() => showAction(report, "dismissed")}
                        size="sm"
                        variant="outline"
                      >
                        Dismiss report
                      </Button>
                    </div>
                  ) : null}
                </article>
              </SectionCard>
            ))
          ) : (
            <SectionCard>
              <WorkspaceEmpty
                title="No reports match these filters"
                description="New participant reports will appear here when submitted."
              />
            </SectionCard>
          )}
          {query.data.pagination.totalPages > 1 ? (
            <div className="flex flex-wrap justify-between gap-3">
              <Button
                disabled={page <= 1 || query.isFetching}
                onClick={() => filter({ page: page - 1 })}
                size="sm"
                variant="outline"
              >
                <ChevronLeft size={15} /> Previous
              </Button>
              <Button
                disabled={
                  page >= query.data.pagination.totalPages || query.isFetching
                }
                onClick={() => filter({ page: page + 1 })}
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
          busyLabel="Saving report…"
          confirmDisabled={reason.trim().length < 3}
          confirmLabel={
            selected.status === "under_review"
              ? "Assign and review"
              : selected.status === "resolved"
                ? "Resolve report"
                : "Dismiss report"
          }
          description={`This report will be marked ${categoryLabel(selected.status)}. The reason is retained in the audit record.`}
          error={failure}
          onCancel={() => {
            if (!mutation.isPending) setSelected(null);
          }}
          onConfirm={() =>
            mutation.mutate({
              report: selected.report,
              nextStatus: selected.status,
            })
          }
          title={
            selected.status === "under_review"
              ? "Begin report review?"
              : selected.status === "resolved"
                ? "Resolve this report?"
                : "Dismiss this report?"
          }
        >
          <label className="block text-xs font-semibold text-navy-950">
            Audit reason
            <textarea
              aria-label="Audit reason"
              className="mt-2 min-h-20 w-full rounded-lg border border-line px-3 py-2 text-sm font-normal outline-none focus:border-emerald-700 focus:ring-4 focus:ring-emerald-500/10"
              maxLength={2000}
              onChange={(event) => setReason(event.target.value)}
              value={reason}
            />
          </label>
          <label className="mt-3 block text-xs font-semibold text-navy-950">
            Moderator notes{" "}
            <span className="font-normal text-ink-faint">(optional)</span>
            <textarea
              aria-label="Moderator notes"
              className="mt-2 min-h-20 w-full rounded-lg border border-line px-3 py-2 text-sm font-normal outline-none focus:border-emerald-700 focus:ring-4 focus:ring-emerald-500/10"
              maxLength={5000}
              onChange={(event) => setNotes(event.target.value)}
              value={notes}
            />
          </label>
        </ConfirmDialog>
      ) : null}
    </>
  );
}

function TargetLink({ report }: { report: AdminReport }) {
  return report.listingId ? (
    <Link
      className="shrink-0 text-xs font-semibold text-emerald-800 hover:underline"
      to="/admin/moderation"
    >
      Review listings · #{report.listingId}
    </Link>
  ) : report.reportedUserId ? (
    <Link
      className="shrink-0 text-xs font-semibold text-emerald-800 hover:underline"
      to={`/admin/users/${report.reportedUserId}`}
    >
      User #{report.reportedUserId}
    </Link>
  ) : (
    <span className="text-xs text-ink-faint">Target unavailable</span>
  );
}
function Meta({ label, value }: { label: string; value: string }) {
  return (
    <p className="text-xs text-ink-soft">
      <span className="font-semibold text-navy-950">{label}: </span>
      {value}
    </p>
  );
}
