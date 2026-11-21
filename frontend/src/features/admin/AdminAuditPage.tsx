import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/shared/ErrorState";
import {
  SectionCard,
  WorkspaceEmpty,
  WorkspacePageHeader,
  WorkspaceSkeleton,
} from "@/components/shared/workspace/WorkspaceUI";
import { listAuditLogs } from "./api";

const targetTypes = ["all", "user", "listing", "report", "admin"] as const;

export function AdminAuditPage() {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get("page")) || 1);
  const actorId = params.get("actorId") ?? "";
  const action = params.get("action") ?? "";
  const targetId = params.get("targetId") ?? "";
  const targetType = targetTypes.includes(
    params.get("targetType") as (typeof targetTypes)[number],
  )
    ? (params.get("targetType") as (typeof targetTypes)[number])
    : "all";
  const [actionInput, setActionInput] = useState(action);
  const [targetInput, setTargetInput] = useState(targetId);
  const [actorInput, setActorInput] = useState(actorId);
  const query = useQuery({
    queryKey: [
      "admin",
      "audit",
      page,
      25,
      actorId,
      action,
      targetId,
      targetType,
    ],
    queryFn: () =>
      listAuditLogs({
        page,
        limit: 25,
        actorId: actorId ? Number(actorId) : undefined,
        action,
        targetId,
        targetType,
      }),
    placeholderData: (previous) => previous,
  });
  const apply = (values: {
    actorId?: string;
    action?: string;
    targetId?: string;
    targetType?: string;
    page?: number;
  }) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(values)) {
      if (!value || value === "all") next.delete(key);
      else next.set(key, String(value));
    }
    if (
      values.actorId !== undefined ||
      values.action !== undefined ||
      values.targetId !== undefined ||
      values.targetType !== undefined
    )
      next.delete("page");
    setParams(next);
  };
  const validActor = actorInput === "" || /^[1-9]\d*$/.test(actorInput);

  return (
    <>
      <WorkspacePageHeader
        description="A paginated, searchable record of administrative actions. Sensitive before/after payloads are intentionally not shown in this interface."
        eyebrow="Platform operations · Accountability"
        title="Audit log"
      />
      <SectionCard className="mb-5">
        <form
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[7rem_minmax(12rem,1fr)_10rem_9rem_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            if (validActor)
              apply({
                actorId: actorInput,
                action: actionInput.trim(),
                targetId: targetInput.trim(),
              });
          }}
        >
          <label>
            <span className="sr-only">Filter by actor ID</span>
            <input
              aria-label="Filter by actor ID"
              className="h-10 w-full rounded-lg border border-line px-3 text-sm outline-none focus:border-emerald-700"
              inputMode="numeric"
              onChange={(event) => setActorInput(event.target.value)}
              placeholder="Actor ID"
              value={actorInput}
            />
          </label>
          <label>
            <span className="sr-only">Filter by action name</span>
            <input
              aria-label="Filter by action name"
              className="h-10 w-full rounded-lg border border-line px-3 text-sm outline-none focus:border-emerald-700"
              onChange={(event) => setActionInput(event.target.value)}
              placeholder="Action, e.g. listing.approved"
              value={actionInput}
            />
          </label>
          <label>
            <span className="sr-only">Filter by target type</span>
            <select
              aria-label="Filter by target type"
              className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm"
              onChange={(event) => apply({ targetType: event.target.value })}
              value={targetType}
            >
              <option value="all">All targets</option>
              {targetTypes.slice(1).map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Filter by target ID</span>
            <input
              aria-label="Filter by target ID"
              className="h-10 w-full rounded-lg border border-line px-3 text-sm outline-none focus:border-emerald-700"
              onChange={(event) => setTargetInput(event.target.value)}
              placeholder="Target ID"
              value={targetInput}
            />
          </label>
          <Button disabled={!validActor} type="submit">
            <Search aria-hidden="true" size={15} /> Apply
          </Button>
        </form>
        {!validActor ? (
          <p className="mt-2 text-xs text-rose-800" role="alert">
            Actor ID must be a positive whole number.
          </p>
        ) : null}
      </SectionCard>
      {query.isPending ? <WorkspaceSkeleton rows={3} /> : null}
      {query.isError ? (
        <ErrorState
          error={query.error}
          description="Audit records could not be loaded."
          onRetry={() => void query.refetch()}
          title="Audit history unavailable"
        />
      ) : null}
      {query.data ? (
        <SectionCard className="overflow-hidden p-0">
          <div className="flex items-center justify-between gap-2 border-b border-line px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-navy-950">
                Administrative events
              </h2>
              <p className="mt-1 text-xs text-ink-soft">
                {query.data.pagination.total} matching audit entries
              </p>
            </div>
            <span className="text-xs text-ink-faint">Newest first</span>
          </div>
          {query.data.auditLogs.length ? (
            <>
              <div className="divide-y divide-line">
                {query.data.auditLogs.map((entry) => (
                  <article
                    className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(0,1fr)_12rem]"
                    key={entry.id}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold capitalize text-navy-950">
                          {entry.action
                            .replaceAll(".", " ")
                            .replaceAll("_", " ")}
                        </h3>
                        <span className="rounded bg-mist px-2 py-0.5 text-[0.65rem] font-medium capitalize text-ink-soft">
                          {entry.targetType} #{entry.targetId}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-ink-soft">
                        Actor {entry.actorId ? `#${entry.actorId}` : "system"}
                        {entry.requestId ? ` · Request ${entry.requestId}` : ""}
                      </p>
                      {entry.reason ? (
                        <p className="mt-2 break-words text-xs leading-5 text-ink-soft">
                          {entry.reason}
                        </p>
                      ) : null}
                    </div>
                    <time
                      className="text-xs text-ink-faint md:text-right"
                      dateTime={new Date(entry.createdAt).toISOString()}
                    >
                      {new Intl.DateTimeFormat(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date(entry.createdAt))}
                    </time>
                  </article>
                ))}
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 sm:px-5">
                <p aria-live="polite" className="text-xs text-ink-soft">
                  Page {page} of {Math.max(1, query.data.pagination.totalPages)}
                </p>
                <div className="flex gap-2">
                  <Button
                    disabled={page <= 1 || query.isFetching}
                    onClick={() => apply({ page: page - 1 })}
                    size="sm"
                    variant="outline"
                  >
                    <ChevronLeft size={15} /> Previous
                  </Button>
                  <Button
                    disabled={
                      page >= query.data.pagination.totalPages ||
                      query.isFetching
                    }
                    onClick={() => apply({ page: page + 1 })}
                    size="sm"
                    variant="outline"
                  >
                    Next <ChevronRight size={15} />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="p-5">
              <WorkspaceEmpty
                title="No matching administrative actions"
                description="Try changing the filters. New audited actions will appear as platform operations are performed."
              />
            </div>
          )}
        </SectionCard>
      ) : null}
    </>
  );
}
