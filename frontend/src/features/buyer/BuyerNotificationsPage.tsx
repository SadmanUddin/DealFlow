import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import {
  Bell,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/shared/ErrorState";
import {
  SectionCard,
  StatusBadge,
  WorkspaceEmpty,
  WorkspacePageHeader,
} from "@/components/shared/workspace/WorkspaceUI";
import { toApiError } from "@/lib/api-error";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type DealFlowNotification,
} from "./api";

function idFromPayload(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0)
    return value;
  return undefined;
}

function notificationTarget(item: DealFlowNotification) {
  const dealId = idFromPayload(item.payload, "dealId");
  const listingId = idFromPayload(item.payload, "listingId");
  const conversationId = idFromPayload(item.payload, "conversationId");
  if (dealId) return `/buyer/offers?deal=${dealId}`;
  if (conversationId) return `/buyer/messages/${conversationId}`;
  if (listingId) return `/listings/${listingId}`;
  return undefined;
}

function humanize(value: string) {
  return value
    .replaceAll(".", " ")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function BuyerNotificationsPage() {
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
  const navigateTo = async (item: DealFlowNotification) => {
    if (!item.readAt) await markOne.mutateAsync(item.id);
    const target = notificationTarget(item);
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
        description="DealFlow updates and account activity, with direct links to the related business or deal when the notification provides one."
        eyebrow="Buyer workspace · Inbox"
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
      {markOne.isError || markAll.isError ? (
        <p
          className="mb-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-900"
          role="alert"
        >
          {toApiError(markOne.error ?? markAll.error).message}
        </p>
      ) : null}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <label className="inline-flex items-center gap-2 text-xs font-medium text-ink-soft">
          <input
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
              const target = notificationTarget(item);
              return (
                <li
                  className={`flex gap-3 px-4 py-4 sm:gap-4 sm:px-5 ${item.readAt ? "" : "bg-emerald-50/35"}`}
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
                        {humanize(item.type)}
                      </h2>
                      {!item.readAt ? <StatusBadge status="pending" /> : null}
                    </div>
                    <p className="mt-1 break-words text-xs leading-5 text-ink-soft">
                      {target
                        ? "Open the related DealFlow item for details."
                        : "This notification has no linked resource."}
                    </p>
                    <p className="mt-1.5 text-[0.68rem] text-ink-faint">
                      {new Intl.DateTimeFormat(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date(item.createdAt))}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
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
