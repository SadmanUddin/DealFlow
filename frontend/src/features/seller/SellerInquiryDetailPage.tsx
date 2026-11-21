import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import { ArrowLeft, Download, FilePlus2, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { ErrorState } from "@/components/shared/ErrorState";
import {
  SectionCard,
  SectionHeading,
  StatusBadge,
  WorkspacePageHeader,
  WorkspaceSkeleton,
} from "@/components/shared/workspace/WorkspaceUI";
import { useAuth } from "@/features/auth/useAuth";
import { toApiError } from "@/lib/api-error";
import {
  deleteInquiryDocument,
  listInquiryDocuments,
  listInquiryMessages,
  listInquiries,
  markInquiryRead,
  sendInquiryMessage,
  updateInquiryStatus,
  uploadInquiryDocument,
  downloadInquiryDocument,
  type ConversationDocument,
  type Inquiry,
} from "./api";

const nextStatuses: Record<Inquiry["status"], Inquiry["status"][]> = {
  pending: ["in_review", "accepted", "rejected", "closed"],
  in_review: ["accepted", "rejected", "closed"],
  accepted: ["closed"],
  rejected: ["closed"],
  closed: [],
};

export function SellerInquiryDetailPage() {
  const id = Number(useParams().id);
  const user = useAuth().user;
  const client = useQueryClient();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [deleting, setDeleting] = useState<ConversationDocument | null>(null);
  const inquiryQuery = useQuery({
    queryKey: ["seller", "inquiries", 1, 100],
    queryFn: () => listInquiries(1, 100),
    staleTime: 10_000,
  });
  const inquiry = inquiryQuery.data?.conversations.find(
    (item) => item.id === id,
  );
  const messagesQuery = useInfiniteQuery({
    queryKey: ["conversations", id, "messages"],
    queryFn: ({ pageParam }) =>
      listInquiryMessages(id, 50, pageParam ?? undefined),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) =>
      lastPage.pagination.hasMore ? lastPage.pagination.nextCursor : undefined,
    enabled: Number.isSafeInteger(id) && id > 0,
    staleTime: 5_000,
  });
  const documentsQuery = useQuery({
    queryKey: ["conversations", id, "documents"],
    queryFn: () => listInquiryDocuments(id),
    enabled: Boolean(inquiry),
    staleTime: 10_000,
  });
  const messageRows = useMemo(
    () => messagesQuery.data?.pages.flatMap((page) => page.messages) ?? [],
    [messagesQuery.data?.pages],
  );
  useEffect(() => {
    if (inquiry)
      void markInquiryRead(id)
        .then(() =>
          client.invalidateQueries({ queryKey: ["seller", "inquiries"] }),
        )
        .catch(() => undefined);
  }, [client, id, inquiry]);
  const statusMutation = useMutation({
    mutationFn: (status: Inquiry["status"]) => updateInquiryStatus(id, status),
    onSuccess: async () => {
      setNotice("Inquiry status updated.");
      setError("");
      await client.invalidateQueries({ queryKey: ["seller", "inquiries"] });
    },
    onError: (reason) => setError(toApiError(reason).message),
  });
  const sendMutation = useMutation({
    mutationFn: (content: string) => sendInquiryMessage(id, content),
    onSuccess: async () => {
      setMessage("");
      setNotice("Message sent.");
      setError("");
      await client.invalidateQueries({
        queryKey: ["conversations", id, "messages"],
      });
    },
    onError: (reason) => setError(toApiError(reason).message),
  });
  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadInquiryDocument(id, file),
    onSuccess: async () => {
      setNotice("Document uploaded securely.");
      setError("");
      await client.invalidateQueries({
        queryKey: ["conversations", id, "documents"],
      });
    },
    onError: (reason) => setError(toApiError(reason).message),
  });
  const removeMutation = useMutation({
    mutationFn: (document: ConversationDocument) =>
      deleteInquiryDocument(id, document.id),
    onSuccess: async () => {
      setDeleting(null);
      setNotice("Document removed.");
      await client.invalidateQueries({
        queryKey: ["conversations", id, "documents"],
      });
    },
    onError: (reason) => setError(toApiError(reason).message),
  });
  const submitMessage = (event: FormEvent) => {
    event.preventDefault();
    const content = message.trim();
    if (content) sendMutation.mutate(content);
  };
  const download = async (document: ConversationDocument) => {
    try {
      const blob = await downloadInquiryDocument(id, document.id);
      const url = URL.createObjectURL(blob);
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download = document.originalFilename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (reason) {
      setError(toApiError(reason).message);
    }
  };

  if (inquiryQuery.isPending) return <WorkspaceSkeleton rows={3} />;
  if (inquiryQuery.isError)
    return (
      <ErrorState
        error={inquiryQuery.error}
        description="The inquiry could not be opened."
        onRetry={() => void inquiryQuery.refetch()}
        title="Inquiry unavailable"
      />
    );
  if (!inquiry)
    return (
      <ErrorState
        description="Only conversations returned for your seller account are available here."
        title="Inquiry not found"
      />
    );
  return (
    <>
      <Link
        className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-emerald-800"
        to="/seller/inquiries"
      >
        <ArrowLeft size={16} /> All inquiries
      </Link>
      <WorkspacePageHeader
        description={`Business listing · ${inquiry.listingTitle} · Inquiry #${inquiry.id}`}
        eyebrow="Seller workspace · Buyer conversation"
        title={inquiry.listingTitle}
      />
      {notice ? (
        <p
          className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
          role="status"
        >
          {notice}
        </p>
      ) : null}
      {error ? (
        <p
          className="mb-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-900"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-5">
          <SectionCard>
            <SectionHeading
              description="Messages are shown in chronological order. The API exposes participant IDs rather than buyer names."
              title="Conversation"
            />
            {messagesQuery.isPending ? (
              <div
                className="mt-4 h-40 animate-pulse rounded-xl bg-mist"
                role="status"
                aria-label="Loading messages"
              />
            ) : null}
            {messagesQuery.isError ? (
              <ErrorState
                error={messagesQuery.error}
                description="Messages could not be loaded."
                onRetry={() => void messagesQuery.refetch()}
                title="Conversation unavailable"
              />
            ) : null}
            {messagesQuery.hasNextPage ? (
              <Button
                className="mt-4"
                disabled={messagesQuery.isFetchingNextPage}
                onClick={() => void messagesQuery.fetchNextPage()}
                variant="outline"
              >
                {messagesQuery.isFetchingNextPage
                  ? "Loading…"
                  : "Load older messages"}
              </Button>
            ) : null}
            <ol aria-label="Conversation messages" className="mt-4 space-y-3">
              {messageRows.map((item) => (
                <li
                  className={`max-w-[90%] rounded-xl border p-3 sm:max-w-[78%] ${item.senderId === user?.id ? "ml-auto border-emerald-200 bg-emerald-50" : "border-line bg-[#F7F9F7]"}`}
                  key={item.id}
                >
                  <p className="mb-1 text-[0.68rem] font-semibold text-ink-soft">
                    {item.senderId === user?.id ? "You" : "Buyer participant"} ·{" "}
                    {new Intl.DateTimeFormat(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(item.createdAt))}
                  </p>
                  <p className="whitespace-pre-wrap break-words text-sm leading-6 text-navy-950">
                    {item.content}
                  </p>
                </li>
              ))}
            </ol>
            {!messageRows.length && !messagesQuery.isPending ? (
              <p className="mt-5 rounded-lg bg-mist px-4 py-5 text-sm text-ink-soft">
                No messages in this conversation yet.
              </p>
            ) : null}
            <form
              className="mt-5 border-t border-line pt-4"
              onSubmit={submitMessage}
            >
              <label
                className="mb-1.5 block text-sm font-semibold text-navy-950"
                htmlFor="seller-reply"
              >
                Reply to buyer
              </label>
              <textarea
                className="min-h-24 w-full rounded-lg border border-line px-3 py-2.5 text-sm leading-6 outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/10"
                id="seller-reply"
                maxLength={10000}
                onChange={(event) => setMessage(event.target.value)}
                value={message}
              />
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="text-xs text-ink-faint">
                  {message.length}/10,000
                </span>
                <Button
                  disabled={!message.trim() || sendMutation.isPending}
                  type="submit"
                  variant="accent"
                >
                  <Send size={15} />
                  {sendMutation.isPending ? "Sending…" : "Send message"}
                </Button>
              </div>
            </form>
          </SectionCard>
          <SectionCard>
            <SectionHeading
              description="Files remain private and are downloaded through authenticated DealFlow routes."
              title="Shared documents"
            />
            {documentsQuery.isPending ? (
              <div
                className="mt-4 h-20 animate-pulse rounded-xl bg-mist"
                role="status"
                aria-label="Loading documents"
              />
            ) : null}
            {documentsQuery.isError ? (
              <ErrorState
                error={documentsQuery.error}
                description="Documents could not be loaded."
                onRetry={() => void documentsQuery.refetch()}
                title="Documents unavailable"
              />
            ) : null}
            {documentsQuery.data?.documents.length ? (
              <ul className="mt-3 divide-y divide-line">
                {documentsQuery.data.documents.map((document) => (
                  <li
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                    key={document.id}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-navy-950">
                        {document.originalFilename}
                      </span>
                      <span className="text-xs text-ink-soft">
                        {document.mimeType} · {formatBytes(document.sizeBytes)}{" "}
                        ·{" "}
                        {new Intl.DateTimeFormat(undefined, {
                          dateStyle: "medium",
                        }).format(new Date(document.createdAt))}
                      </span>
                    </span>
                    <span className="flex gap-1">
                      <Button
                        aria-label={`Download ${document.originalFilename}`}
                        onClick={() => void download(document)}
                        size="icon"
                        variant="ghost"
                      >
                        <Download size={16} />
                      </Button>
                      <Button
                        aria-label={`Remove ${document.originalFilename}`}
                        onClick={() => setDeleting(document)}
                        size="icon"
                        variant="ghost"
                      >
                        <Trash2 size={16} />
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            {!documentsQuery.data?.documents.length &&
            !documentsQuery.isPending ? (
              <p className="mt-4 text-sm text-ink-soft">
                No shared documents in this conversation.
              </p>
            ) : null}
            <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-line px-3 py-2 text-xs font-semibold text-navy-950 hover:bg-mist">
              <FilePlus2 size={15} /> Upload private document
              <input
                accept=".pdf,.docx,.xlsx,.csv"
                aria-label="Upload private conversation document"
                className="sr-only"
                disabled={uploadMutation.isPending}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) uploadMutation.mutate(file);
                  event.target.value = "";
                }}
                type="file"
              />
            </label>
            <p className="mt-2 text-xs text-ink-faint">
              Accepted by the server: PDF, DOCX, XLSX, and CSV. Size is
              validated by the backend.
            </p>
          </SectionCard>
        </div>
        <SectionCard>
          <SectionHeading
            description="Only status changes permitted by the conversation workflow are offered."
            title="Inquiry status"
          />
          <div className="mt-4 flex items-center gap-2">
            <StatusBadge status={inquiry.status} />
            <span className="text-xs text-ink-soft">
              Updated{" "}
              {new Intl.DateTimeFormat(undefined, {
                dateStyle: "medium",
              }).format(new Date(inquiry.statusUpdatedAt))}
            </span>
          </div>
          <label
            className="mt-5 block text-xs font-semibold text-ink-soft"
            htmlFor="inquiry-status"
          >
            Move inquiry to
          </label>
          <select
            className="mt-1.5 h-10 w-full rounded-lg border border-line bg-white px-3 text-sm capitalize text-navy-950"
            disabled={
              statusMutation.isPending || !nextStatuses[inquiry.status].length
            }
            id="inquiry-status"
            onChange={(event) => {
              if (event.target.value)
                statusMutation.mutate(event.target.value as Inquiry["status"]);
              event.target.value = "";
            }}
            value=""
          >
            <option value="">Choose next status</option>
            {nextStatuses[inquiry.status].map((status) => (
              <option className="capitalize" key={status} value={status}>
                {status.replace("_", " ")}
              </option>
            ))}
          </select>
          {!nextStatuses[inquiry.status].length ? (
            <p className="mt-2 text-xs text-ink-faint">
              This inquiry has no remaining seller status transitions.
            </p>
          ) : null}
          <p className="mt-4 text-xs text-ink-faint">
            Started{" "}
            {new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
              new Date(inquiry.createdAt),
            )}
          </p>
        </SectionCard>
      </div>
      {deleting ? (
        <ConfirmDialog
          busy={removeMutation.isPending}
          confirmLabel="Remove document"
          description={`Remove “${deleting.originalFilename}” from this private conversation?`}
          error={
            removeMutation.isError
              ? toApiError(removeMutation.error).message
              : undefined
          }
          onCancel={() => setDeleting(null)}
          onConfirm={() => removeMutation.mutate(deleting)}
          title="Remove this document?"
        />
      ) : null}
    </>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
