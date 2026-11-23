import { DealDocumentsPanel } from "./DealDocumentsPanel";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DealDiligencePanel,
  DiligenceClosingNotice,
} from "./DealDiligencePanel";
import type { Deal } from "./api";
import type {
  ChecklistItem,
  Diligence,
  DocumentRequest,
} from "./diligence-api";

const api = vi.hoisted(() => ({
  getDiligence: vi.fn(),
  createChecklistItem: vi.fn(),
  updateChecklistItem: vi.fn(),
  createDocumentRequest: vi.fn(),
  updateDocumentRequest: vi.fn(),
  listDealDocuments: vi.fn(),
  getDealConversation: vi.fn(),
  listDealConversationDocuments: vi.fn(),
  linkDealDocument: vi.fn(),
}));

vi.mock("./diligence-api", async (original) => ({
  ...(await original<typeof import("./diligence-api")>()),
  ...api,
}));
vi.mock("./api", async (original) => ({
  ...(await original<typeof import("./api")>()),
  listDealDocuments: api.listDealDocuments,
  getDealConversation: api.getDealConversation,
  listDealConversationDocuments: api.listDealConversationDocuments,
  linkDealDocument: api.linkDealDocument,
}));

const date = "2026-01-02T12:00:00Z";
const deal: Deal = {
  id: 11,
  listing_id: 1,
  buyer_id: 1,
  seller_id: 2,
  status: "accepted",
  buyer_name: "Marta",
  seller_name: "Jo",
  accepted_at: date,
  created_at: date,
  updated_at: date,
  agreed_offer: { amount: "250000", currency: "EUR" },
};
const checklist: ChecklistItem = {
  id: 15,
  title: "Review invoices",
  description: "Match invoices to receipts",
  category: "financial",
  status: "pending",
  assigned_to: "buyer",
  due_date: "2026-01-01",
  overdue: true,
  completed_at: null,
  created_by: 2,
  created_at: date,
  updated_at: date,
  revision: 0,
};
const request: DocumentRequest = {
  id: 21,
  title: "Tax returns",
  description: "",
  status: "requested",
  requested_by: 1,
  responsible_id: 2,
  document_id: null,
  document_filename: null,
  reviewed_at: null,
  reviewed_by: null,
  feedback: null,
  due_date: null,
  revision: 0,
  created_at: date,
  updated_at: date,
};
const data: Diligence = {
  checklist: [checklist],
  requests: [request],
  checklistTotal: 1,
  requestTotal: 1,
  pageSize: 20,
  progress: {
    total: 2,
    completed: 1,
    pending: 1,
    inProgress: 0,
    blocked: 0,
    overdue: 1,
    outstandingRequests: 1,
  },
  startedAt: date,
  firstDocumentAcceptedAt: null,
};

function show(userId = 1, current = deal, includeDocuments = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <DiligenceClosingNotice dealId={deal.id} />
      <DealDiligencePanel deal={current} userId={userId} />
      {includeDocuments && (
        <DealDocumentsPanel dealId={current.id} userId={userId} />
      )}
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.getDiligence.mockResolvedValue(data);
  api.listDealDocuments.mockResolvedValue({
    documents: [
      { id: 9, filename: "returns.pdf", uploadedBy: 2 },
      { id: 10, filename: "other.pdf", uploadedBy: 1 },
    ],
    pagination: { total: 2 },
  });
  for (const mock of [
    api.createChecklistItem,
    api.updateChecklistItem,
    api.createDocumentRequest,
    api.updateDocumentRequest,
  ]) {
    mock.mockResolvedValue({ id: 1 });
  }
});

describe("deal diligence", () => {
  it("shows server totals, assignment, overdue state and a nonblocking closing warning", async () => {
    const user = userEvent.setup();
    show();
    expect(
      await screen.findByText("1 of 2 tasks completed (50%)"),
    ).toBeInTheDocument();
    const task = within(screen.getByRole("region", { name: "Checklist" }));
    expect(task.getByText("Overdue")).toBeInTheDocument();
    expect(task.getByText(/assigned to you/i)).toBeInTheDocument();
    expect(screen.getByText(/Closing remains available/)).toBeInTheDocument();
    expect(screen.getByText("Offer accepted")).toBeInTheDocument();
    await user.selectOptions(
      task.getByLabelText("Filter by category"),
      "financial",
    );
    await user.selectOptions(task.getByLabelText("Filter by assignee"), "mine");
    await waitFor(() =>
      expect(api.getDiligence).toHaveBeenLastCalledWith(11, {
        category: "financial",
        assignment: "mine",
        page: 1,
        requestPage: 1,
      }),
    );
    expect(
      screen.getByText("1 of 2 tasks completed (50%)"),
    ).toBeInTheDocument();
  });

  it("creates and edits tasks and sends a revision with the update", async () => {
    const user = userEvent.setup();
    show();
    const section = within(
      await screen.findByRole("region", { name: "Checklist" }),
    );
    await user.click(
      section.getByRole("button", { name: "Add checklist item" }),
    );
    expect(section.getByRole("textbox", { name: "Title" })).toHaveFocus();
    await user.type(
      section.getByRole("textbox", { name: "Title" }),
      "Inspect contracts",
    );
    await user.selectOptions(
      section.getByLabelText("Assigned participant"),
      "seller",
    );
    await user.click(
      section.getByRole("button", { name: "Create checklist item" }),
    );
    await waitFor(() =>
      expect(api.createChecklistItem).toHaveBeenCalledWith(11, {
        title: "Inspect contracts",
        assignedTo: "seller",
        category: "other",
        description: "",
        dueDate: null,
        creationKey: expect.any(String),
      }),
    );
    await user.click(
      await section.findByRole("button", { name: "Edit Review invoices" }),
    );
    await user.selectOptions(
      section.getByLabelText("Task status"),
      "completed",
    );
    await user.click(section.getByRole("button", { name: "Save task" }));
    expect(api.updateChecklistItem).toHaveBeenCalledWith(
      11,
      15,
      expect.objectContaining({ status: "completed", revision: 0 }),
    );
  });

  it("creates requests and shows review actions only to the requester", async () => {
    const user = userEvent.setup();
    api.getDiligence.mockResolvedValue({
      ...data,
      requests: [
        {
          ...request,
          status: "under_review",
          document_id: 9,
          document_filename: "returns.pdf",
          revision: 2,
          reviewed_by: 1,
          reviewed_at: date,
        },
      ],
    });
    show();
    const section = within(
      await screen.findByRole("region", { name: "Document requests" }),
    );
    await user.click(
      section.getByRole("button", { name: "Request a document" }),
    );
    await user.type(
      section.getByRole("textbox", { name: "Title" }),
      "Annual statements",
    );
    await user.click(
      section.getByRole("button", { name: "Send document request" }),
    );
    expect(api.createDocumentRequest).toHaveBeenCalledWith(
      11,
      expect.objectContaining({ title: "Annual statements" }),
    );
    await user.type(
      section.getByLabelText("Review feedback (optional)"),
      "Include 2025.",
    );
    await user.click(section.getByRole("button", { name: "Request changes" }));
    expect(api.updateDocumentRequest).toHaveBeenCalledWith(11, 21, {
      revision: 2,
      action: "request_changes",
      feedback: "Include 2025.",
    });
  });

  it("allows the responsible participant to submit only their eligible linked files", async () => {
    const user = userEvent.setup();
    show(2);
    const select = await screen.findByLabelText("Linked document");
    expect(
      screen.queryByRole("option", { name: "other.pdf" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Accept submission" }),
    ).not.toBeInTheDocument();
    await user.selectOptions(select, "9");
    await user.click(screen.getByRole("button", { name: "Submit document" }));
    expect(api.updateDocumentRequest).toHaveBeenCalledWith(11, 21, {
      action: "submit",
      revision: 0,
      documentId: 9,
    });
  });

  it("distinguishes same-name uploads and refreshes request eligibility after linking", async () => {
    const user = userEvent.setup();
    const base = {
      filename: "records.csv",
      mimeType: "text/csv",
      sizeBytes: 100,
      createdAt: date,
    };
    const first = { ...base, id: 7, uploadedBy: 1 };
    const duplicate = { ...base, id: 8, uploadedBy: 1 };
    const own = { ...base, id: 9, uploadedBy: 2 };
    const linked = [first];
    const list = () => ({
      documents: [...linked],
      pagination: { total: linked.length },
    });
    let resolveInitial!: () => void;
    api.listDealDocuments
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveInitial = () => resolve(list());
          }),
      )
      .mockImplementation(async () => list());
    api.getDealConversation.mockResolvedValue({ id: 100 });
    api.listDealConversationDocuments.mockResolvedValue({
      documents: [first, duplicate, own].map((file) => ({
        ...file,
        originalFilename: file.filename,
        uploaderId: file.uploadedBy,
      })),
    });
    api.linkDealDocument.mockImplementation(async (_dealId, id) => {
      linked.push(id === duplicate.id ? duplicate : own);
    });

    show(2, deal, true);
    await screen.findByLabelText("Upload private deal document");
    expect(
      screen.queryByRole("button", {
        name: "Link to deal · records.csv · File #7",
      }),
    ).not.toBeInTheDocument();
    resolveInitial();
    const requestSection = within(
      await screen.findByRole("region", { name: "Document requests" }),
    );
    expect(
      await requestSection.findByText(
        /linked files on this page were uploaded by the other participant/i,
      ),
    ).toBeInTheDocument();
    await user.click(
      await screen.findByRole("button", {
        name: "Link to deal · records.csv · File #8",
      }),
    );
    await waitFor(() => expect(api.linkDealDocument).toHaveBeenCalledWith(11, 8));
    expect(
      await screen.findByRole("button", {
        name: "Download records.csv · File #8",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Download records.csv · File #7" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("File #7 · Uploaded by the other participant"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("File #8 · Uploaded by the other participant"),
    ).toBeInTheDocument();
    expect(
      requestSection.queryByLabelText("Linked document"),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", {
        name: "Link to deal · records.csv · File #9",
      }),
    );
    const picker = await requestSection.findByLabelText("Linked document");
    expect(
      within(picker).getByRole("option", { name: "records.csv · File #9" }),
    ).toBeInTheDocument();
    expect(
      within(picker).queryByRole("option", { name: "records.csv · File #8" }),
    ).not.toBeInTheDocument();
  });

  it("shows the empty progress state and keeps completed deals read-only", async () => {
    api.getDiligence.mockResolvedValue({
      ...data,
      checklist: [],
      checklistTotal: 0,
      progress: {
        ...data.progress,
        total: 0,
        completed: 0,
        pending: 0,
        overdue: 0,
      },
    });
    show(1, { ...deal, status: "completed", completed_at: date });
    expect(
      await screen.findByText(/add a checklist item to start/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Request a document" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/records are read-only/)).toBeInTheDocument();
  });
});
