import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/shared/ErrorState";
import {
  SectionHeading,
  WorkspaceSkeleton,
} from "@/components/shared/workspace/WorkspaceUI";
import { toApiError } from "@/lib/api-error";
import type { Deal } from "./api";
import {
  assignments,
  categories,
  taskStatuses,
  createChecklistItem,
  createDocumentRequest,
  diligenceKey,
  getDiligence,
  initialDiligenceFilters,
  updateChecklistItem,
  updateDocumentRequest,
  type ChecklistFields,
  type ChecklistItem,
  type DiligenceFields,
  type DiligenceFilters,
} from "./diligence-api";
import { DiligenceSummary } from "./DiligenceSummary";
import { diligenceDateLabel, diligenceStatusLabel } from "./diligence-format";

import { DiligenceRequestCard } from "./DiligenceRequestCard";
import {
  diligenceControl,
  diligenceLabel,
  diligenceCard,
  DiligencePager,
} from "./DiligenceControls";

function fields(data: FormData): DiligenceFields {
  return {
    title: String(data.get("title")).trim(),
    description: String(data.get("description")).trim(),
    dueDate: String(data.get("dueDate")) || null,
  };
}

function TextFields({ initial }: { initial?: ChecklistItem }) {
  return (
    <>
      <label className={diligenceLabel}>
        Title <span aria-hidden="true">*</span>
        <input
          className={diligenceControl}
          name="title"
          autoFocus
          required
          maxLength={160}
          defaultValue={initial?.title}
        />
      </label>
      <label className={diligenceLabel}>
        Description
        <textarea
          className={diligenceControl}
          name="description"
          rows={2}
          maxLength={4000}
          defaultValue={initial?.description}
        />
      </label>
      <label className={diligenceLabel}>
        Due date (UTC)
        <input
          className={diligenceControl}
          name="dueDate"
          type="date"
          defaultValue={initial?.due_date ?? ""}
        />
      </label>
    </>
  );
}

function TaskFields({ initial }: { initial?: ChecklistItem }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className={diligenceLabel}>
        Category
        <select
          className={diligenceControl}
          name="category"
          defaultValue={initial?.category ?? "other"}
        >
          {categories.map((category) => (
            <option key={category} value={category}>
              {diligenceStatusLabel(category)}
            </option>
          ))}
        </select>
      </label>
      <label className={diligenceLabel}>
        Assigned participant
        <select
          className={diligenceControl}
          name="assignedTo"
          defaultValue={initial?.assigned_to ?? "buyer"}
        >
          {assignments.map((role) => (
            <option key={role} value={role}>
              {diligenceStatusLabel(role)}
            </option>
          ))}
        </select>
      </label>
      {initial && (
        <label className={diligenceLabel}>
          Task status
          <select
            className={diligenceControl}
            name="status"
            defaultValue={initial.status}
          >
            {taskStatuses.map((status) => (
              <option key={status} value={status}>
                {diligenceStatusLabel(status)}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
const taskFields = (data: FormData): ChecklistFields => ({
  ...fields(data),
  assignedTo: data.get("assignedTo") as ChecklistItem["assigned_to"],
  category: data.get("category") as ChecklistItem["category"],
});

export function DealDiligencePanel({
  deal,
  userId,
}: {
  deal: Deal;
  userId: number;
}) {
  const client = useQueryClient();
  const [filters, setFilters] = useState(initialDiligenceFilters);
  const [editing, setEditing] = useState<{
    id: number;
    revision: number;
  } | null>(null);
  const [form, setForm] = useState<"task" | "request" | null>(null);
  const [creationKey, setCreationKey] = useState("");
  const [notice, setNotice] = useState("");
  const [failure, setFailure] = useState("");
  const writable = !["completed", "cancelled", "rejected"].includes(
    deal.status,
  );
  const query = useQuery({
    queryKey: [...diligenceKey(deal.id), filters],
    queryFn: () => getDiligence(deal.id, filters),
    placeholderData: (previous) => previous,
    refetchOnWindowFocus: true,
  });
  const mutation = useMutation({
    mutationFn: (action: () => Promise<unknown>) => action(),
    onMutate: () => {
      setFailure("");
      setNotice("");
    },
    onSuccess: async () => {
      setEditing(null);
      setForm(null);
      setNotice("Diligence updated.");
      await Promise.all([
        client.invalidateQueries({ queryKey: diligenceKey(deal.id) }),
        client.invalidateQueries({ queryKey: ["deals", deal.id, "history"] }),
      ]);
    },
    onError: (error) => {
      const failure = toApiError(error);
      setFailure(failure.message);
      if (failure.status === 409) void query.refetch();
    },
  });
  const data = query.data;
  const changeFilter = (changes: Partial<DiligenceFilters>) =>
    setFilters((current) => ({ ...current, ...changes }));
  const busy = mutation.isPending;
  const ownRole = userId === deal.buyer_id ? "buyer" : "seller";
  const openForm = (next: "task" | "request") => {
    setForm(next);
    setCreationKey(crypto.randomUUID());
  };

  const create = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const input = new FormData(event.currentTarget);
    mutation.mutate(() =>
      form === "task"
        ? createChecklistItem(deal.id, { ...taskFields(input), creationKey })
        : createDocumentRequest(deal.id, { ...fields(input), creationKey }),
    );
  };

  return (
    <Card
      id="deal-diligence"
      role="region"
      tabIndex={-1}
      aria-label="Due diligence"
      className="scroll-mt-24 p-5 shadow-none sm:p-6 focus-visible:outline-2 focus-visible:outline-emerald-700"
    >
      <SectionHeading
        title="Due diligence"
        description="Track assigned tasks, private document requests, and recorded acquisition milestones."
      />
      {notice && (
        <p role="status" className="mb-3 rounded-lg bg-emerald-50 p-3 text-sm">
          {notice}
        </p>
      )}
      {failure && (
        <p
          role="alert"
          className="mb-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-900"
        >
          {failure}
        </p>
      )}
      {query.isPending && <WorkspaceSkeleton rows={3} />}
      {query.isError && (
        <ErrorState
          error={query.error}
          title="Diligence unavailable"
          onRetry={() => void query.refetch()}
        />
      )}
      {data && (
        <div className="space-y-5">
          <DiligenceSummary deal={deal} diligence={data} />
          {!writable && (
            <p className="rounded-lg bg-mist p-3 text-sm text-ink-soft">
              Diligence records are read-only for ended deals.
            </p>
          )}
          <section className="space-y-3" aria-label="Checklist">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg font-semibold text-navy-950">Checklist</h3>
              {writable && (
                <Button size="sm" onClick={() => openForm("task")}>
                  Add checklist item
                </Button>
              )}
            </div>
            {form === "task" && writable && (
              <form className={`${diligenceCard} space-y-3`} onSubmit={create}>
                <TextFields />
                <TaskFields />
                <Button disabled={busy} type="submit" size="sm">
                  Create checklist item
                </Button>{" "}
                <Button
                  disabled={busy}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setForm(null)}
                >
                  Cancel
                </Button>
              </form>
            )}
            <div className="grid gap-2 sm:grid-cols-3">
              <label className={diligenceLabel}>
                Filter by category
                <select
                  className={diligenceControl}
                  value={filters.category ?? ""}
                  onChange={(event) =>
                    changeFilter({
                      page: 1,
                      category: (event.target.value ||
                        undefined) as DiligenceFilters["category"],
                    })
                  }
                >
                  <option value="">All categories</option>
                  {categories.map((category) => (
                    <option key={category} value={category}>
                      {diligenceStatusLabel(category)}
                    </option>
                  ))}
                </select>
              </label>
              <label className={diligenceLabel}>
                Filter by status
                <select
                  className={diligenceControl}
                  value={filters.status ?? ""}
                  onChange={(event) =>
                    changeFilter({
                      page: 1,
                      status: (event.target.value ||
                        undefined) as DiligenceFilters["status"],
                    })
                  }
                >
                  <option value="">All statuses</option>
                  {taskStatuses.map((status) => (
                    <option key={status} value={status}>
                      {diligenceStatusLabel(status)}
                    </option>
                  ))}
                </select>
              </label>
              <label className={diligenceLabel}>
                Filter by assignee
                <select
                  className={diligenceControl}
                  value={filters.assignment ?? ""}
                  onChange={(event) =>
                    changeFilter({
                      page: 1,
                      assignment: (event.target.value ||
                        undefined) as DiligenceFilters["assignment"],
                    })
                  }
                >
                  <option value="">All assignments</option>
                  <option value="mine">Assigned to me</option>
                  <option value="other">Assigned to other participant</option>
                </select>
              </label>
            </div>
            {query.isPlaceholderData ? (
              <p role="status" className="text-sm">
                Updating checklist…
              </p>
            ) : data.checklist.length === 0 ? (
              <p className="text-sm text-ink-soft">
                No checklist items match this view.
              </p>
            ) : (
              data.checklist.map((item) => (
                <article key={item.id} className={diligenceCard}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h4 className="break-words font-semibold text-navy-950">
                        {item.title}
                      </h4>
                      <p className="mt-1 text-xs text-ink-soft">
                        {diligenceStatusLabel(item.status)} ·{" "}
                        {diligenceStatusLabel(item.category)} ·{" "}
                        {item.assigned_to === ownRole
                          ? "Assigned to you"
                          : `Assigned to ${item.assigned_to}`}
                      </p>
                    </div>
                    {writable && editing?.id !== item.id && (
                      <Button
                        disabled={busy}
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setEditing({ id: item.id, revision: item.revision })
                        }
                        aria-label={`Edit ${item.title}`}
                      >
                        Edit task
                      </Button>
                    )}
                  </div>
                  {item.description && (
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm text-ink-soft">
                      {item.description}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-ink-soft">
                    {item.due_date && (
                      <span>Due {diligenceDateLabel(item.due_date)} UTC</span>
                    )}
                    {item.overdue && (
                      <span className="font-semibold text-rose-900">
                        Overdue
                      </span>
                    )}
                    {item.completed_at && (
                      <span>
                        Completed {diligenceDateLabel(item.completed_at)}
                      </span>
                    )}
                  </div>
                  {writable && editing?.id === item.id && (
                    <form
                      className="mt-3 space-y-3"
                      onSubmit={(event) => {
                        event.preventDefault();
                        const input = new FormData(event.currentTarget);
                        mutation.mutate(() =>
                          updateChecklistItem(deal.id, item.id, {
                            ...taskFields(input),
                            status: input.get(
                              "status",
                            ) as ChecklistItem["status"],
                            revision: editing.revision,
                          }),
                        );
                      }}
                    >
                      {editing.revision !== item.revision && (
                        <p role="status" className="text-sm text-amber-950">
                          This task changed. Close the editor and reopen it to
                          see the latest version.
                        </p>
                      )}
                      <TextFields initial={item} />
                      <TaskFields initial={item} />
                      <Button
                        type="submit"
                        disabled={busy || editing.revision !== item.revision}
                        size="sm"
                      >
                        Save task
                      </Button>{" "}
                      <Button
                        type="button"
                        disabled={busy}
                        variant="outline"
                        size="sm"
                        onClick={() => setEditing(null)}
                      >
                        Cancel
                      </Button>
                    </form>
                  )}
                </article>
              ))
            )}
            <DiligencePager
              label="Checklist pages"
              page={filters.page}
              size={data.pageSize}
              total={data.checklistTotal}
              change={(page) => changeFilter({ page })}
            />
          </section>
          <section
            aria-label="Document requests"
            className="space-y-3 border-t border-line pt-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg font-semibold text-navy-950">
                Document requests
              </h3>
              {writable && (
                <Button size="sm" onClick={() => openForm("request")}>
                  Request a document
                </Button>
              )}
            </div>
            <p className="text-sm text-ink-soft">
              Acceptance records the requesting participant’s review. DealFlow
              does not independently verify documents.
            </p>
            {form === "request" && writable && (
              <form className={`${diligenceCard} space-y-3`} onSubmit={create}>
                <TextFields />
                <p className="text-xs text-ink-soft">
                  The {ownRole === "buyer" ? "seller" : "buyer"} will be
                  responsible for providing the file.
                </p>
                <Button disabled={busy} type="submit" size="sm">
                  Send document request
                </Button>{" "}
                <Button
                  disabled={busy}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setForm(null)}
                >
                  Cancel
                </Button>
              </form>
            )}
            {query.isPlaceholderData ? (
              <p role="status" className="text-sm">
                Updating document requests…
              </p>
            ) : data.requests.length === 0 ? (
              <p className="text-sm text-ink-soft">
                No document requests on this page.
              </p>
            ) : (
              data.requests.map((request) => (
                <DiligenceRequestCard
                  key={`${request.id}-${request.revision}`}
                  request={request}
                  deal={deal}
                  userId={userId}
                  writable={writable}
                  busy={busy}
                  submit={(id, input) =>
                    mutation.mutate(() =>
                      updateDocumentRequest(deal.id, id, input),
                    )
                  }
                />
              ))
            )}
            <DiligencePager
              label="Document request pages"
              page={filters.requestPage}
              size={data.pageSize}
              total={data.requestTotal}
              change={(requestPage) => changeFilter({ requestPage })}
            />
          </section>
        </div>
      )}
    </Card>
  );
}

export function DiligenceClosingNotice({ dealId }: { dealId: number }) {
  const query = useQuery({
    queryKey: [...diligenceKey(dealId), initialDiligenceFilters],
    queryFn: () => getDiligence(dealId, initialDiligenceFilters),
  });
  const progress = query.data?.progress;
  if (
    !progress ||
    (progress.total === progress.completed &&
      progress.outstandingRequests === 0)
  )
    return null;
  return (
    <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
      There are {progress.total - progress.completed} open checklist tasks and{" "}
      {progress.outstandingRequests} outstanding document requests. Review{" "}
      <a className="font-semibold underline" href="#deal-diligence">
        due diligence
      </a>{" "}
      before confirming the acquisition. Closing remains available when its
      existing requirements are met.
    </p>
  );
}
