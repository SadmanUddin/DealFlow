import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/shared/ErrorState";
import { toApiError } from "@/lib/api-error";
import { listDealDocuments, type Deal } from "./api";
import { downloadLinkedDocument } from "./download-linked-document";
import type { DocumentRequest, RequestAction } from "./diligence-api";
import { diligenceDateLabel, diligenceStatusLabel } from "./diligence-format";
import {
  diligenceControl,
  diligenceLabel,
  diligenceCard,
  DiligencePager,
} from "./DiligenceControls";

function DocumentPicker({
  dealId,
  userId,
  busy,
  submit,
}: {
  dealId: number;
  userId: number;
  busy: boolean;
  submit: (id: number) => void;
}) {
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ["deals", dealId, "documents", page, 100],
    queryFn: () => listDealDocuments(dealId, page, 100),
  });
  const options =
    query.data?.documents.filter((file) => file.uploadedBy === userId) ?? [];
  return (
    <div className="mt-3 space-y-2">
      <p className="text-xs leading-5 text-ink-soft">
        Choose a file you uploaded and linked in{" "}
        <a className="font-semibold underline" href="#deal-documents">
          Deal room documents
        </a>
        . Linking someone else’s file keeps their upload ownership. Your file
        must be available after any required security review.
      </p>
      {query.isPending && (
        <p role="status" className="text-sm">
          Loading linked documents…
        </p>
      )}
      {query.isError && (
        <ErrorState
          title="Linked documents unavailable"
          onRetry={() => void query.refetch()}
          error={query.error}
        />
      )}
      {query.isSuccess && (
        <>
          {options.length > 0 ? (
            <form
              className="flex flex-wrap items-end gap-2"
              key={page}
              onSubmit={(event) => {
                event.preventDefault();
                submit(
                  Number(new FormData(event.currentTarget).get("document")),
                );
              }}
            >
              <label className={`${diligenceLabel} min-w-0 flex-1`}>
                Linked document
                <select className={diligenceControl} name="document" required>
                  <option value="">Select a file</option>
                  {options.map((file) => (
                    <option key={file.id} value={file.id}>
                      {file.filename} · File #{file.id}
                    </option>
                  ))}
                </select>
              </label>
              <Button type="submit" disabled={busy} size="sm">
                Submit document
              </Button>
            </form>
          ) : (
            <p className="text-sm text-ink-soft">
              {query.data.documents.length > 0 &&
              query.data.documents.every(
                (file) => file.uploadedBy !== undefined,
              )
                ? "The linked files on this page were uploaded by the other participant. Upload and link your own copy to submit it."
                : "No eligible files on this page. Upload and link your own file once it is available."}
            </p>
          )}
          <DiligencePager
            label="Linked document pages"
            page={page}
            size={100}
            total={query.data.pagination.total}
            change={setPage}
          />
        </>
      )}
    </div>
  );
}

export function DiligenceRequestCard({
  request,
  deal,
  userId,
  writable,
  busy,
  submit,
}: {
  request: DocumentRequest;
  deal: Deal;
  userId: number;
  writable: boolean;
  busy: boolean;
  submit: (id: number, input: RequestAction) => void;
}) {
  const [feedback, setFeedback] = useState("");
  const [downloadError, setDownloadError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const responsible = request.responsible_id === userId;
  const requester = request.requested_by === userId;
  const name = (id: number) =>
    id === deal.buyer_id
      ? (deal.buyer_name ?? "Buyer")
      : (deal.seller_name ?? "Seller");
  const send = (action: "review" | "accept" | "request_changes") => {
    submit(request.id, { action, revision: request.revision, feedback });
  };
  const download = async () => {
    if (!request.document_id || !request.document_filename) return;
    setDownloading(true);
    setDownloadError("");
    try {
      await downloadLinkedDocument(
        deal.id,
        request.document_id,
        request.document_filename,
      );
    } catch (error) {
      setDownloadError(toApiError(error).message);
    } finally {
      setDownloading(false);
    }
  };
  return (
    <article className={diligenceCard}>
      <h4 className="break-words font-semibold text-navy-950">
        {request.title}
      </h4>
      <p className="mt-1 text-xs font-semibold text-emerald-900">
        {diligenceStatusLabel(request.status)}
      </p>
      {request.description && (
        <p className="mt-2 whitespace-pre-wrap break-words text-sm text-ink-soft">
          {request.description}
        </p>
      )}
      <p className="mt-2 break-words text-xs text-ink-soft">
        Requested by {name(request.requested_by)} · Responsible participant{" "}
        {name(request.responsible_id)}
        {request.due_date &&
          ` · Due ${diligenceDateLabel(request.due_date)} UTC`}
      </p>
      {request.reviewed_by && request.reviewed_at && (
        <p className="mt-2 text-xs text-ink-soft">
          Reviewed by {name(request.reviewed_by)} on{" "}
          {diligenceDateLabel(request.reviewed_at)}
        </p>
      )}
      {request.feedback && (
        <p className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-white p-2 text-sm">
          {request.feedback}
        </p>
      )}
      {request.document_filename ? (
        <Button
          className="mt-2 h-auto max-w-full whitespace-normal break-all"
          size="sm"
          variant="outline"
          disabled={downloading}
          onClick={() => void download()}
        >
          {downloading
            ? "Downloading…"
            : `Download ${request.document_filename}`}
        </Button>
      ) : (
        request.document_id !== null && (
          <p className="mt-2 text-sm text-ink-soft">
            The submitted file is currently unavailable.
          </p>
        )
      )}
      {downloadError && (
        <p role="alert" className="mt-2 text-sm text-rose-900">
          {downloadError}
        </p>
      )}
      {writable &&
        responsible &&
        (request.status === "requested" ||
          request.status === "changes_requested") && (
          <DocumentPicker
            dealId={deal.id}
            userId={userId}
            busy={busy}
            submit={(documentId) =>
              submit(request.id, {
                action: "submit",
                documentId,
                revision: request.revision,
              })
            }
          />
        )}
      {writable && requester && request.status === "submitted" && (
        <Button
          className="mt-3"
          size="sm"
          disabled={busy}
          onClick={() => send("review")}
        >
          Start review
        </Button>
      )}
      {writable && requester && request.status === "under_review" && (
        <div className="mt-3 space-y-2">
          <label className={diligenceLabel}>
            Review feedback (optional)
            <textarea
              className={diligenceControl}
              maxLength={4000}
              rows={2}
              value={feedback}
              onChange={(event) => setFeedback(event.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={busy || !request.document_filename}
              onClick={() => send("accept")}
            >
              Accept submission
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => send("request_changes")}
            >
              Request changes
            </Button>
          </div>
        </div>
      )}
    </article>
  );
}
