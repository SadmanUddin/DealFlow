import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Link, useLocation, useSearchParams } from "react-router";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/shared/ErrorState";
import {
  SectionCard,
  WorkspaceEmpty,
  WorkspacePageHeader,
  WorkspaceSkeleton,
} from "@/components/shared/workspace/WorkspaceUI";
import { useAuth } from "@/features/auth/useAuth";
import { toApiError } from "@/lib/api-error";
import {
  listConversationMessages,
  listConversations,
  markConversationRead,
  sendConversationMessage,
} from "./api";

function dateLabel(value: string | Date) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

function ConversationInboxPage({ role }: { role: "buyer" | "seller" }) {
  const { user } = useAuth();
  const client = useQueryClient();
  const location = useLocation();
  const notice = (location.state as { notice?: string } | null)?.notice;
  const [params, setParams] = useSearchParams();
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const conversationsQuery = useQuery({
    queryKey: ["workspace", "conversations", role, 1, 100],
    queryFn: () => listConversations(1, 100),
    staleTime: 15_000,
  });
  const conversations = conversationsQuery.data?.conversations ?? [];
  const requestedId = Number(params.get("conversation"));
  const active =
    conversations.find((item) => item.id === requestedId) ?? conversations[0];
  const activeId = active?.id;
  useEffect(() => {
    if (activeId && activeId !== requestedId)
      setParams({ conversation: String(activeId) }, { replace: true });
  }, [active, activeId, requestedId, setParams]);
  const messagesQuery = useInfiniteQuery({
    queryKey: ["conversations", active?.id, "messages"],
    queryFn: ({ pageParam }) =>
      listConversationMessages(active!.id, 50, pageParam ?? undefined),
    enabled: Boolean(active),
    initialPageParam: null as string | null,
    getNextPageParam: (last) =>
      last.pagination.hasMore ? last.pagination.nextCursor : undefined,
  });
  const messages = useMemo(
    () => messagesQuery.data?.pages.flatMap((page) => page.messages) ?? [],
    [messagesQuery.data?.pages],
  );
  const sendMutation = useMutation({
    mutationFn: (text: string) => sendConversationMessage(active!.id, text),
    onSuccess: async () => {
      setContent("");
      setError("");
      await Promise.all([
        client.invalidateQueries({
          queryKey: ["conversations", active?.id, "messages"],
        }),
        client.invalidateQueries({
          queryKey: ["workspace", "conversations", role],
        }),
      ]);
    },
    onError: (reason) => setError(toApiError(reason).message),
  });
  useEffect(() => {
    if (!activeId) return;
    void markConversationRead(activeId)
      .then(({ readCount }) => {
        const cached = client.getQueryData<
          Awaited<ReturnType<typeof listConversations>>
        >(["workspace", "conversations", role, 1, 100]);
        const cachedUnread = cached?.conversations.some(
          (item) => item.id === activeId && item.unreadCount > 0,
        );
        if (readCount > 0 || cachedUnread) {
          return client.invalidateQueries({
            queryKey: ["workspace", "conversations", role],
          });
        }
      })
      .catch((reason) => setError(toApiError(reason).message));
  }, [activeId, client, role]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const text = content.trim();
    if (text && !sendMutation.isPending) sendMutation.mutate(text);
  };

  return (
    <>
      <WorkspacePageHeader
        eyebrow={(role === "buyer" ? "Buyer" : "Seller") + " workspace · Inbox"}
        title="Conversations"
        description={
          role === "buyer"
            ? "Questions and updates with sellers about businesses you are considering."
            : "Questions and updates from buyers about your business listings."
        }
        action={
          role === "buyer" ? (
            <Button asChild variant="outline">
              <Link to="/marketplace">Browse businesses</Link>
            </Button>
          ) : undefined
        }
      />
      {notice ? (
        <p
          role="status"
          className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
        >
          {notice}
        </p>
      ) : null}
      {conversationsQuery.isPending ? <WorkspaceSkeleton rows={3} /> : null}
      {conversationsQuery.isError ? (
        <ErrorState
          error={conversationsQuery.error}
          title="Conversations unavailable"
          description="Your inbox could not be loaded."
          onRetry={() => void conversationsQuery.refetch()}
        />
      ) : null}
      {conversationsQuery.data && !conversations.length ? (
        <SectionCard>
          <WorkspaceEmpty
            title="No conversations yet"
            description={
              role === "buyer"
                ? "Contact a seller from a business listing to start an inquiry."
                : "Buyer conversations about your listings will appear here."
            }
            action={
              role === "buyer" ? (
                <Button asChild variant="accent">
                  <Link to="/marketplace">Explore businesses</Link>
                </Button>
              ) : undefined
            }
          />
        </SectionCard>
      ) : null}
      {active ? (
        <div className="grid min-h-[32rem] min-w-0 grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(12rem,0.38fr)_minmax(0,1fr)]">
          <SectionCard className="min-w-0 p-2 sm:p-2">
            <h2 className="border-b border-line px-3 py-3 text-sm font-semibold">
              Your conversations
            </h2>
            <ul className="mt-2 max-h-64 space-y-1 overflow-auto lg:max-h-[33rem]">
              {conversations.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => setParams({ conversation: String(item.id) })}
                    aria-pressed={active.id === item.id}
                    className={`w-full rounded-lg border px-3 py-3 text-left focus-visible:outline-2 focus-visible:outline-emerald-800 ${active.id === item.id ? "border-emerald-100 bg-emerald-50" : "border-transparent hover:bg-mist"}`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold">
                        {item.listingTitle}
                      </span>
                      {item.unreadCount > 0 ? (
                        <span className="rounded-full bg-emerald-700 px-2 py-0.5 text-xs text-white">
                          {item.unreadCount}
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-1 block text-xs text-ink-soft">
                      {item.participantName ??
                        (role === "buyer" ? "Seller" : "Buyer")}
                    </span>
                    <span className="mt-1 block truncate text-xs text-ink-faint">
                      {item.latestMessage ?? "No messages yet"}
                    </span>
                    {item.latestMessageAt ? (
                      <time className="mt-1 block text-[0.68rem] text-ink-faint">
                        {dateLabel(item.latestMessageAt)}
                      </time>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          </SectionCard>
          <SectionCard className="flex min-h-[30rem] min-w-0 flex-col">
            <div className="border-b border-line pb-4">
              <h2 className="break-words text-lg font-semibold">
                {active.listingTitle}
              </h2>
              <p className="mt-1 text-xs text-ink-soft">
                Conversation with{" "}
                {active.participantName ??
                  (role === "buyer" ? "the seller" : "the buyer")}{" "}
                ·{" "}
                <Link
                  className="text-emerald-800 underline"
                  to={`/listings/${active.listingId}`}
                >
                  View listing
                </Link>
              </p>
            </div>
            {messagesQuery.isPending ? (
              <div
                className="my-4 h-40 animate-pulse rounded-xl bg-mist"
                role="status"
                aria-label="Loading messages"
              />
            ) : null}
            {messagesQuery.isError ? (
              <ErrorState
                error={messagesQuery.error}
                title="Messages unavailable"
                description="This conversation could not be loaded."
                onRetry={() => void messagesQuery.refetch()}
              />
            ) : null}
            {messagesQuery.hasNextPage ? (
              <Button
                className="mt-3 self-start"
                variant="outline"
                disabled={messagesQuery.isFetchingNextPage}
                onClick={() => void messagesQuery.fetchNextPage()}
              >
                Load older messages
              </Button>
            ) : null}
            <ol
              aria-label="Conversation messages"
              className="my-4 flex-1 space-y-3 overflow-y-auto lg:max-h-[28rem]"
            >
              {messages.map((message) => (
                <li
                  key={message.id}
                  className={`max-w-[88%] rounded-2xl border border-line px-4 py-3 ${message.senderId === user?.id ? "ml-auto rounded-br-sm border-emerald-100 bg-emerald-50" : "rounded-bl-sm bg-paper"}`}
                >
                  <p className="mb-1 text-[0.68rem] font-semibold text-ink-soft">
                    {message.senderId === user?.id
                      ? "You"
                      : (message.senderName ??
                        active.participantName ??
                        (role === "buyer" ? "Seller" : "Buyer"))}{" "}
                    · {dateLabel(message.createdAt)}
                  </p>
                  <p className="whitespace-pre-wrap break-words text-sm leading-6">
                    {message.content}
                  </p>
                </li>
              ))}
            </ol>
            {!messages.length && !messagesQuery.isPending ? (
              <p className="my-4 text-sm text-ink-soft">
                No messages yet. Send{" "}
                {role === "buyer" ? "the seller" : "the buyer"} a message to
                begin.
              </p>
            ) : null}
            {error ? (
              <p
                role="alert"
                className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-900"
              >
                {error}
              </p>
            ) : null}
            <form
              onSubmit={submit}
              className="flex items-end gap-2 border-t border-line pt-3"
            >
              <label className="sr-only" htmlFor={role + "-message"}>
                Write a message
              </label>
              <textarea
                id={role + "-message"}
                value={content}
                onChange={(event) => setContent(event.target.value)}
                maxLength={10000}
                rows={2}
                className="min-h-11 min-w-0 flex-1 resize-y rounded-lg border border-line px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-emerald-800"
                placeholder={
                  "Write a message to " +
                  (role === "buyer" ? "the seller" : "the buyer")
                }
              />
              <Button
                type="submit"
                variant="accent"
                disabled={sendMutation.isPending || !content.trim()}
              >
                <Send size={15} />
                {sendMutation.isPending ? "Sending…" : "Send"}
              </Button>
            </form>
          </SectionCard>
        </div>
      ) : null}
    </>
  );
}

export function BuyerConversationsPage() {
  return <ConversationInboxPage role="buyer" />;
}

export function SellerConversationsPage() {
  return <ConversationInboxPage role="seller" />;
}
