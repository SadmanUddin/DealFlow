import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import {
  Bell,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/shared/ErrorState";
import {
  SectionCard,
  WorkspaceEmpty,
  WorkspacePageHeader,
} from "@/components/shared/workspace/WorkspaceUI";
import { toApiError } from "@/lib/api-error";
import { useAuth } from "@/features/auth/useAuth";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  deleteNotification,
  type DealFlowNotification,
} from "./api";

function idFromPayload(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0)
    return value;
  return undefined;
}

function notificationTarget(
  item: DealFlowNotification,
  audience: "buyer" | "seller",
) {
  const dealId = idFromPayload(item.payload, "dealId");
  const listingId = idFromPayload(item.payload, "listingId");
  const conversationId = idFromPayload(item.payload, "conversationId");
  if (dealId) {
    const diligence = diligenceNotificationTypes.has(item.type);
    return `/${audience}/deals/${dealId}${diligence ? "#deal-diligence" : ""}`;
  }
  if (conversationId)
    return `/${audience}/conversations?conversation=${conversationId}`;
  if (listingId) return `/listings/${listingId}`;
  return undefined;
}

const diligenceNotificationTypes = new Set([
  "deal.task_assigned",
  "deal.document_requested",
  "deal.document_submitted",
  "deal.document_changes_requested",
  "deal.document_accepted",
]);

function notificationDescription(item: DealFlowNotification) {
  if (item.type === "saved_search.match") {
    const names = Array.isArray(item.payload.searchNames)
      ? item.payload.searchNames.filter(
          (name): name is string => typeof name === "string",
        )
      : [];
    const title =
      typeof item.payload.title === "string"
        ? item.payload.title
        : "A business";
    return names.length
      ? `${title} matches ${names.join(", ")}.`
      : `${title} matches your saved search.`;
  }
  return String(item.payload.listingTitle ?? "Open this update for details.");
}

const notificationLabels: Record<string, string> = {
  "saved_search.match": "New business matches your saved search",
  "deal.closing_proposed": "Review the proposed closing amount",
  "deal.closing_agreed": "Closing amount agreed",
  "deal.closing_confirmed":
    "Your confirmation is needed to complete the acquisition",
  "deal.closing_disputed": "Closing paused after a dispute",
  "deal.closing_resolved": "Closing dispute resolved",
  "deal.task_assigned": "A diligence task was assigned to you",
  "deal.document_requested": "A document was requested from you",
  "deal.document_submitted": "A document is ready for your review",
  "deal.document_changes_requested": "Changes were requested for your document",
  "deal.document_accepted": "Your document was accepted",
  "deal.completed": "Acquisition completed and listing marked sold",
  "listing.sold": "This business has been sold",
};

function humanize(value: string) {
  return (
    notificationLabels[value] ??
    value
      .replaceAll(".", " ")
      .replaceAll("_", " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase())
  );
}

export function BuyerNotificationsPage() {
  const { user } = useAuth();
  const audience = user?.role === "seller" ? "seller" : "buyer";
  const client = useQueryClient();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [notice, setNotice] = useState("");
  const query = useQuery({
    queryKey: ["buyer", "notifications", page, unreadOnly],
    queryFn: () => listNotifications(page, 30, unreadOnly ? true : undefined),
    staleTime: 15_000,
  });
  const refresh = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: ["buyer", "notifications"] }),
      client.invalidateQueries({ queryKey: ["buyer", "overview"] }),
      client.invalidateQueries({ queryKey: ["notifications", "unread-count"] }),
    ]);
  const markOne = useMutation({
    mutationFn: (id: number) => markNotificationRead(id),
    onSuccess: async () => {
      setNotice("Notification marked as read.");
      await refresh();
    },
  });
  const markAll = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: async ({ updatedCount }) => {
      setNotice(
        updatedCount
          ? `${updatedCount} notification${updatedCount === 1 ? "" : "s"} marked as read.`
          : "You’re all caught up.",
      );
      setPage(1);
      setUnreadOnly(false);
      await refresh();
    },
  });
  const remove = useMutation({
    mutationFn: deleteNotification,
    onSuccess: async () => {
      setNotice("Notification deleted.");
      await refresh();
    },
  });
  const navigateTo = async (item: DealFlowNotification) => {
    if (!item.readAt) await markOne.mutateAsync(item.id);
    const target = notificationTarget(item, audience);
    if (target) navigate(target);
  };

  return (
    <>
      <WorkspacePageHeader
        action={
          <Button
            disabled={
              markAll.isPending ||
              !query.data?.notifications.some((item) => !item.readAt)
            }
            onClick={() => markAll.mutate()}
            variant="outline"
          >
            <CheckCheck aria-hidden="true" size={16} /> Mark all read
          </Button>
        }
        description="Updates on your businesses, conversations, and deals."
        eyebrow="Workspace · Inbox"
        title="Notifications"
      />
      {notice ? (
        <p
          className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
          role="status"
        >
          {notice}
        </p>
      ) : null}
      {markOne.isError || markAll.isError || remove.isError ? (
        <p
          className="mb-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-900"
          role="alert"
        >
          {toApiError(markOne.error ?? markAll.error ?? remove.error).message}
        </p>
      ) : null}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-white px-4 py-2">
        <label className="inline-flex min-h-10 items-center gap-2 text-sm font-medium text-ink">
          <input
            className="size-4 accent-forest"
            checked={unreadOnly}
            onChange={(event) => {
              setUnreadOnly(event.target.checked);
              setPage(1);
            }}
            type="checkbox"
          />{" "}
          Unread only
        </label>
        <span className="text-xs text-ink-soft">
          {query.data?.pagination.total.toLocaleString() ?? "—"}{" "}
          {unreadOnly ? "unread notifications" : "notifications"}
        </span>
      </div>
      {query.isPending ? (
        <div
          aria-label="Loading notifications"
          className="space-y-2"
          role="status"
        >
          {Array.from({ length: 5 }, (_, index) => (
            <div
              className="h-20 animate-pulse rounded-xl bg-mist"
              key={index}
            />
          ))}
        </div>
      ) : null}
      {query.isError ? (
        <ErrorState
          error={query.error}
          description="We couldn’t load your notifications."
          onRetry={() => void query.refetch()}
          title="Notifications unavailable"
        />
      ) : null}
      {query.data && query.data.notifications.length ? (
        <SectionCard className="p-0 sm:p-0">
          <ul className="divide-y divide-line">
            {query.data.notifications.map((item) => {
              const target = notificationTarget(item, audience);
              return (
                <li
                  className={`grid grid-cols-[auto_minmax(0,1fr)] gap-3 px-4 py-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:gap-4 sm:px-5 ${item.readAt ? "" : "bg-emerald-50/35"}`}
                  key={item.id}
                >
                  <span
                    className={`mt-1 grid size-8 shrink-0 place-items-center rounded-full ${item.readAt ? "bg-mist text-ink-faint" : "bg-emerald-100 text-emerald-900"}`}
                  >
                    <Bell aria-hidden="true" size={15} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-sm font-semibold text-navy-950">
                        {item.type === "conversation.message"
                          ? `New message from ${String(item.payload.senderName ?? "a participant")}`
                          : humanize(item.type)}
                      </h2>
                      {!item.readAt && (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-900">
                          Unread
                        </span>
                      )}
                    </div>
                    <p className="mt-1 break-words text-xs leading-5 text-ink-soft">
                      {target
                        ? notificationDescription(item)
                        : "Account activity"}
                    </p>
                    <p className="mt-1.5 text-[0.68rem] text-ink-faint">
                      {new Intl.DateTimeFormat(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date(item.createdAt))}
                    </p>
                  </div>
                  <div className="col-start-2 flex flex-wrap items-center gap-2 sm:col-start-3 sm:flex-col sm:items-end">
                    {target ? (
                      <Button
                        aria-label={`Open ${humanize(item.type)}`}
                        onClick={() => void navigateTo(item)}
                        size="sm"
                        variant="outline"
                      >
                        Open <ExternalLink aria-hidden="true" size={13} />
                      </Button>
                    ) : null}
                    {!item.readAt ? (
                      <button
                        className="text-[0.68rem] font-semibold text-emerald-800 hover:text-emerald-950"
                        disabled={markOne.isPending}
                        onClick={() => markOne.mutate(item.id)}
                        type="button"
                      >
                        Mark read
                      </button>
                    ) : null}
                    <button
                      aria-label="Delete notification"
                      className="text-[0.68rem] font-semibold text-ink-soft hover:text-rose-800"
                      disabled={remove.isPending}
                      onClick={() => remove.mutate(item.id)}
                      type="button"
                    >
                      <Trash2 size={13} /> Delete
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </SectionCard>
      ) : null}
      {query.data && query.data.notifications.length === 0 ? (
        <SectionCard>
          <WorkspaceEmpty
            description={
              unreadOnly
                ? "No unread activity needs your attention."
                : "Deal updates, offers, and other account activity will appear here."
            }
            title={unreadOnly ? "You’re all caught up" : "No notifications yet"}
          />
        </SectionCard>
      ) : null}
      {query.data && query.data.pagination.totalPages > 1 ? (
        <nav
          aria-label="Notification pages"
          className="mt-5 flex items-center justify-between border-t border-line pt-4"
        >
          <span className="text-xs text-ink-soft">
            Page {page} of {query.data.pagination.totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              disabled={page <= 1 || query.isFetching}
              onClick={() => setPage((value) => value - 1)}
              size="sm"
              variant="outline"
            >
              <ChevronLeft aria-hidden="true" size={15} /> Previous
            </Button>
            <Button
              disabled={
                page >= query.data.pagination.totalPages || query.isFetching
              }
              onClick={() => setPage((value) => value + 1)}
              size="sm"
              variant="outline"
            >
              Next <ChevronRight aria-hidden="true" size={15} />
            </Button>
          </div>
        </nav>
      ) : null}
    </>
  );
}
