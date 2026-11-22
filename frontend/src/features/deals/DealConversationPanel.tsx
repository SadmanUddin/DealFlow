import { useState } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { MessageSquareText, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/shared/ErrorState";
import {
  SectionCard,
  SectionHeading,
  StatusBadge,
  WorkspaceEmpty,
  WorkspaceSkeleton,
} from "@/components/shared/workspace/WorkspaceUI";
import { toApiError } from "@/lib/api-error";
import {
  listDealConversationMessages,
  getDealConversation,
  markDealConversationRead,
  sendDealConversationMessage,
  startDealConversation,
  type Deal,
} from "./api";

const messageSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, "Write a message before sending.")
    .max(10000, "Messages must be 10,000 characters or fewer."),
});
type MessageForm = z.infer<typeof messageSchema>;

function formatMessageDate(value: string | Date) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { dateTime: undefined, label: "Date unavailable" };
  }
  return {
    dateTime: date.toISOString(),
    label: new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date),
  };
}

export function DealConversationPanel({
  deal,
  currentUserId,
}: {
  deal: Deal;
  currentUserId: number;
}) {
  const client = useQueryClient();
  const [notice, setNotice] = useState("");
  const [failure, setFailure] = useState("");
  const conversationsQuery = useQuery({
    queryKey: ["deals", deal.id, "conversation"],
    queryFn: () => getDealConversation(deal.id),
  });
  const conversation = conversationsQuery.data;
  const canStartConversation =
    currentUserId === deal.buyer_id &&
    !["completed", "cancelled", "rejected"].includes(deal.status);
  const messagesQuery = useInfiniteQuery({
    queryKey: ["conversations", conversation?.id, "messages"],
    queryFn: ({ pageParam }) =>
      listDealConversationMessages(conversation!.id, pageParam),
    enabled: Boolean(conversation),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.pagination.hasMore
        ? (lastPage.pagination.nextCursor ?? undefined)
        : undefined,
  });
  const form = useForm<MessageForm>({
    resolver: zodResolver(messageSchema),
    defaultValues: { content: "" },
  });
  const messageContent = useWatch({ control: form.control, name: "content" });
  const startMutation = useMutation({
    mutationFn: () => startDealConversation(deal.id),
    onSuccess: async () => {
      setNotice("Your private buyer conversation is ready.");
      setFailure("");
      await client.invalidateQueries({
        queryKey: ["deals", deal.id, "conversation"],
      });
    },
    onError: (error) => setFailure(toApiError(error).message),
  });
  const sendMutation = useMutation({
    mutationFn: (content: string) =>
      sendDealConversationMessage(conversation!.id, content),
    onSuccess: async () => {
      form.reset({ content: "" });
      setNotice("Message sent.");
      setFailure("");
      await client.invalidateQueries({
        queryKey: ["conversations", conversation?.id, "messages"],
      });
    },
    onError: (error) => setFailure(toApiError(error).message),
  });
  const readMutation = useMutation({
    mutationFn: () => markDealConversationRead(conversation!.id),
    onSuccess: async () => {
      setNotice("Conversation marked as read.");
      await client.invalidateQueries({
        queryKey: ["conversations", conversation?.id, "messages"],
      });
    },
    onError: (error) => setFailure(toApiError(error).message),
  });
  const messages =
    messagesQuery.data?.pages.flatMap((page) => page.messages) ?? [];

  return (
    <SectionCard>
      <SectionHeading
        description="Messages are visible only to the buyer and seller in this private listing conversation."
        title="Buyer conversation"
      />
      {notice ? (
        <p
          className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-950"
          role="status"
        >
          {notice}
        </p>
      ) : null}
      {failure ? (
        <p
          className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-900"
          role="alert"
        >
          {failure}
        </p>
      ) : null}
      {conversationsQuery.isPending ? <WorkspaceSkeleton rows={1} /> : null}
      {conversationsQuery.isError ? (
        <ErrorState
          error={conversationsQuery.error}
          description="Private conversation records could not be loaded."
          onRetry={() => void conversationsQuery.refetch()}
          title="Conversation unavailable"
        />
      ) : null}
      {conversationsQuery.data === null ? (
        <WorkspaceEmpty
          title="No conversation is linked to this deal yet"
          description="A buyer can open the private conversation for this listing. Messages and source documents stay within that participant-authorized thread."
          action={
            canStartConversation ? (
              <Button
                disabled={startMutation.isPending}
                onClick={() => startMutation.mutate()}
                size="sm"
                variant="accent"
              >
                <MessageSquareText aria-hidden="true" size={14} />{" "}
                {startMutation.isPending
                  ? "Opening conversation…"
                  : "Open buyer conversation"}
              </Button>
            ) : undefined
          }
        />
      ) : null}
      {conversation ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-mist/70 px-3 py-2.5">
            <div>
              <p className="text-xs font-semibold text-navy-950">
                Conversation with{" "}
                {conversation.participantName ?? "participant"}
              </p>
              <p className="mt-1 text-[0.68rem] text-ink-soft">
                {conversation.listingTitle}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={conversation.status} />
              <Button
                disabled={readMutation.isPending}
                onClick={() => readMutation.mutate()}
                size="sm"
                variant="outline"
              >
                Mark read
              </Button>
            </div>
          </div>
          {messagesQuery.isPending ? (
            <div
              aria-label="Loading messages"
              className="h-40 animate-pulse rounded-xl bg-mist"
              role="status"
            />
          ) : null}
          {messagesQuery.isError ? (
            <ErrorState
              error={messagesQuery.error}
              description="Messages could not be loaded."
              onRetry={() => void messagesQuery.refetch()}
              title="Message history unavailable"
            />
          ) : null}
          {messagesQuery.data ? (
            <div className="space-y-3">
              {messagesQuery.hasNextPage ? (
                <Button
                  className="w-full"
                  disabled={messagesQuery.isFetchingNextPage}
                  onClick={() => void messagesQuery.fetchNextPage()}
                  size="sm"
                  variant="outline"
                >
                  {messagesQuery.isFetchingNextPage
                    ? "Loading more…"
                    : "Load more messages"}
                </Button>
              ) : null}
              {messages.length ? (
                <ol
                  aria-label="Conversation messages"
                  className="max-h-[28rem] space-y-3 overflow-y-auto pr-1"
                >
                  {messages.map((message) => {
                    const timestamp = formatMessageDate(message.createdAt);
                    return (
                      <li
                        className={`rounded-xl border px-4 py-3 ${message.senderId === currentUserId ? "ml-3 border-emerald-200 bg-emerald-50/70 sm:ml-10" : "mr-3 border-line bg-white sm:mr-10"}`}
                        key={message.id}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs font-semibold text-navy-950">
                            {message.senderName ??
                              (message.senderId === currentUserId
                                ? "You"
                                : "Other participant")}
                            {message.senderId === currentUserId ? " · you" : ""}
                          </p>
                          <time
                            className="text-[0.65rem] text-ink-faint"
                            dateTime={timestamp.dateTime}
                          >
                            {timestamp.label}
                          </time>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-ink-soft">
                          {message.content}
                        </p>
                        {message.readAt ? (
                          <p className="mt-1 text-right text-[0.62rem] text-ink-faint">
                            Read
                          </p>
                        ) : null}
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <WorkspaceEmpty
                  title="No messages yet"
                  description="Send a message to begin the private conversation."
                />
              )}
              <form
                className="space-y-2 border-t border-line pt-4"
                noValidate
                onSubmit={form.handleSubmit(async (values) => {
                  setFailure("");
                  await sendMutation.mutateAsync(values.content);
                })}
              >
                <label
                  className="block text-xs font-semibold text-navy-950"
                  htmlFor="deal-conversation-message"
                >
                  Message
                </label>
                <textarea
                  aria-describedby={
                    form.formState.errors.content
                      ? "deal-message-error"
                      : undefined
                  }
                  aria-invalid={Boolean(form.formState.errors.content)}
                  className="min-h-24 w-full resize-y rounded-lg border border-line px-3 py-2.5 text-sm leading-5 outline-none focus:border-emerald-700 focus:ring-4 focus:ring-emerald-500/10"
                  id="deal-conversation-message"
                  maxLength={10000}
                  onChange={(event) =>
                    form.setValue("content", event.target.value, {
                      shouldValidate: form.formState.isSubmitted,
                    })
                  }
                  placeholder="Share a question or update…"
                  value={messageContent}
                />
                {form.formState.errors.content ? (
                  <p className="text-xs text-rose-800" id="deal-message-error">
                    {form.formState.errors.content.message}
                  </p>
                ) : null}
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[0.65rem] text-ink-faint">
                    {messageContent.length}/10,000
                  </p>
                  <Button
                    disabled={
                      sendMutation.isPending || form.formState.isSubmitting
                    }
                    size="sm"
                    type="submit"
                    variant="accent"
                  >
                    <Send aria-hidden="true" size={14} />{" "}
                    {sendMutation.isPending ? "Sending…" : "Send message"}
                  </Button>
                </div>
              </form>
            </div>
          ) : null}
        </div>
      ) : null}
    </SectionCard>
  );
}
