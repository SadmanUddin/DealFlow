import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Download, FileLock2, Link2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/shared/ErrorState";
import {
  SectionCard,
  SectionHeading,
  WorkspaceEmpty,
  WorkspaceSkeleton,
} from "@/components/shared/workspace/WorkspaceUI";
import { toApiError } from "@/lib/api-error";
import {
  linkDealDocument,
  listDealDocuments,
  listDealConversationDocuments,
  getDealConversation,
  uploadDealConversationDocument,
} from "./api";
import { downloadLinkedDocument } from "./download-linked-document";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DealDocumentsPanel({
  dealId,
  userId,
}: {
  dealId: number;
  userId?: number;
}) {
  const client = useQueryClient();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyDocument, setBusyDocument] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const documentsQuery = useQuery({
    queryKey: ["deals", dealId, "documents", 1, 100],
    queryFn: () => listDealDocuments(dealId, 1, 100),
  });
  // Deal participants share the listing conversation for deal documents.
  const conversationsQuery = useQuery({
    queryKey: ["deals", dealId, "conversation"],
    queryFn: () => getDealConversation(dealId),
    enabled: true,
  });
  const conversation = conversationsQuery.data;
  const sourceDocumentsQuery = useQuery({
    queryKey: ["conversations", conversation?.id, "documents"],
    queryFn: () => listDealConversationDocuments(conversation!.id),
    enabled: Boolean(conversation),
  });
  const linkMutation = useMutation({
    mutationFn: (documentId: number) => linkDealDocument(dealId, documentId),
    onSuccess: async () => {
      setError("");
      setNotice("Private document linked to this deal room.");
      await client.invalidateQueries({
        queryKey: ["deals", dealId, "documents"],
      });
      await client.invalidateQueries({
        queryKey: ["deals", dealId, "history"],
      });
    },
    onError: (reason) => setError(toApiError(reason).message),
  });

  const download = async (documentId: number, filename: string) => {
    setBusyDocument(documentId);
    setError("");
    try {
      await downloadLinkedDocument(dealId, documentId, filename);
    } catch (reason) {
      setError(toApiError(reason).message);
    } finally {
      setBusyDocument(null);
    }
  };

  const uploadAndLink = async (file: File) => {
    if (!conversation || uploading) return;
    setUploading(true);
    setError("");
    setNotice("");
    try {
      const uploaded = await uploadDealConversationDocument(
        conversation.id,
        file,
      );
      if (uploaded.status === "pending") {
        setNotice(
          "Document uploaded. It will be available to link after security review.",
        );
      } else {
        await linkMutation.mutateAsync(uploaded.id);
      }
      await client.invalidateQueries({
        queryKey: ["conversations", conversation.id, "documents"],
      });
    } catch (reason) {
      setError(toApiError(reason).message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <SectionCard id="deal-documents" className="scroll-mt-24">
      <SectionHeading
        description="Documents shared here are available to both deal participants."
        title="Deal room documents"
      />
      {notice ? (
        <p
          className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-950"
          role="status"
        >
          {notice}
        </p>
      ) : null}
      {error ? (
        <p
          className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-900"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      {documentsQuery.isPending ? <WorkspaceSkeleton rows={2} /> : null}
      {documentsQuery.isError ? (
        <ErrorState
          error={documentsQuery.error}
          description="Deal room documents could not be loaded."
          onRetry={() => void documentsQuery.refetch()}
          title="Documents unavailable"
        />
      ) : null}
      {documentsQuery.data && documentsQuery.data.documents.length === 0 ? (
        <WorkspaceEmpty
          title="No deal room documents"
          description="Share a file from the deal conversation to make it available here."
        />
      ) : null}
      {documentsQuery.data?.documents.length ? (
        <ul className="space-y-2">
          {documentsQuery.data.documents.map((document) => (
            <li
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-paper p-3"
              key={document.id}
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-mist text-emerald-900">
                  <FileLock2 aria-hidden="true" size={16} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-navy-950">
                    {document.filename}
                  </span>
                  <span className="block text-xs text-ink-soft">
                    File #{document.id}
                    {document.uploadedBy !== undefined &&
                      (document.uploadedBy === userId
                        ? " · Uploaded by you"
                        : " · Uploaded by the other participant")}
                  </span>
                  <span className="text-xs text-ink-soft">
                    {document.mimeType} · {formatBytes(document.sizeBytes)} ·{" "}
                    {new Intl.DateTimeFormat(undefined, {
                      dateStyle: "medium",
                    }).format(new Date(document.createdAt))}
                  </span>
                </span>
              </div>
              <Button
                aria-label={`Download ${document.filename} · File #${document.id}`}
                disabled={busyDocument === document.id}
                onClick={() => void download(document.id, document.filename)}
                size="sm"
                variant="outline"
              >
                <Download aria-hidden="true" size={14} />
                {busyDocument === document.id ? "Downloading…" : "Download"}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      {documentsQuery.data && documentsQuery.data.pagination.total > 100 ? (
        <p className="mt-3 text-xs text-ink-faint">
          Showing the newest 100 linked documents.
        </p>
      ) : null}

      <div className="mt-5 border-t border-line pt-4">
        <h3 className="text-sm font-semibold text-navy-950">
          Add a private document
        </h3>
        <p className="mt-1 max-w-2xl text-xs leading-5 text-ink-soft">
          Upload permitted files to the existing private listing conversation,
          then link them to this deal room. Both deal participants can access
          documents linked here.
        </p>
        {conversationsQuery.isPending ? (
          <div
            aria-label="Loading private conversation"
            className="mt-3 h-12 animate-pulse rounded-lg bg-mist"
            role="status"
          />
        ) : null}
        {conversationsQuery.isError ? (
          <ErrorState
            error={conversationsQuery.error}
            description="Your private listing conversation could not be loaded."
            onRetry={() => void conversationsQuery.refetch()}
            title="Conversation unavailable"
          />
        ) : null}
        {conversation && sourceDocumentsQuery.isPending ? (
          <div
            aria-label="Loading conversation documents"
            className="mt-3 h-12 animate-pulse rounded-lg bg-mist"
            role="status"
          />
        ) : null}
        {conversation && sourceDocumentsQuery.isError ? (
          <ErrorState
            error={sourceDocumentsQuery.error}
            description="Private source documents could not be loaded."
            onRetry={() => void sourceDocumentsQuery.refetch()}
            title="Source documents unavailable"
          />
        ) : null}
        {!conversationsQuery.isPending &&
        !conversationsQuery.isError &&
        !conversation ? (
          <p className="mt-3 rounded-lg bg-mist px-3 py-2 text-xs text-ink-soft">
            Open the listing conversation above before adding documents to this
            deal.
          </p>
        ) : null}
        {conversation && sourceDocumentsQuery.data ? (
          <div className="mt-3 space-y-2">
            {documentsQuery.isSuccess &&
              sourceDocumentsQuery.data.documents
                .filter(
                  (item) =>
                    !documentsQuery.data?.documents.some(
                      (linked) => linked.id === item.id,
                    ),
                )
                .map((document) => (
                  <div
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-2"
                    key={document.id}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-semibold text-navy-950">
                        {document.originalFilename}
                      </span>
                      <span className="block text-[0.68rem] text-ink-soft">
                        File #{document.id} ·{" "}
                        {document.uploaderId === userId
                          ? "Uploaded by you"
                          : "Uploaded by the other participant"}
                      </span>
                      <span className="text-[0.68rem] text-ink-soft">
                        {document.mimeType} · {formatBytes(document.sizeBytes)}
                      </span>
                    </span>
                    <Button
                      aria-label={`Link to deal · ${document.originalFilename} · File #${document.id}`}
                      disabled={linkMutation.isPending || uploading}
                      onClick={() => linkMutation.mutate(document.id)}
                      size="sm"
                      variant="outline"
                    >
                      <Link2 aria-hidden="true" size={14} />
                      {linkMutation.isPending ? "Linking…" : "Link to deal"}
                    </Button>
                  </div>
                ))}
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-line px-3 py-2 text-xs font-semibold text-navy-950 transition hover:bg-mist focus-within:ring-4 focus-within:ring-emerald-500/15">
              <Upload aria-hidden="true" size={14} /> Upload a private document
              <input
                accept=".pdf,.docx,.xlsx,.csv"
                aria-label="Upload private deal document"
                className="sr-only"
                disabled={linkMutation.isPending}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (file) void uploadAndLink(file);
                  event.currentTarget.value = "";
                }}
                type="file"
              />
            </label>
            <p className="text-[0.68rem] text-ink-faint">
              Choose a PDF, Word document, Excel workbook, or CSV file.
            </p>
          </div>
        ) : null}
      </div>
    </SectionCard>
  );
}
